'use babel';

import SwaggerParser from 'swagger-parser';
import { generateRange } from 'atom-linter';

function tokenizedLineForRow(editor, lineNumber) {
  return editor.tokenizedBuffer.tokenizedLineForRow(lineNumber);
}

function checkTokenScope(scopes) {
  return scopes.includes('entity.name.tag.yaml') ||
    scopes.includes('meta.structure.dictionary.json');
}

function extractRange(givenPath, editor) {
  let lineNumber = 0;
  let pathIndex = 0;
  let foundRange;
  const maxLine = editor.getLineCount();
  // remove numeric indexes
  const path = givenPath.filter(str => isNaN(str));

  const checkLineTokens = (tokens) => {
    let offset = 0;
    tokens.forEach((token) => {
      if (checkTokenScope(token.scopes) &&
          token.value === path[pathIndex]) {
        pathIndex += 1;
        if (pathIndex >= path.length) {
          foundRange = [[lineNumber, offset], [lineNumber, offset + token.value.length]];
          return;
        }
      }
      offset += token.value.length;
    });
  };

  while (lineNumber <= maxLine) {
    const tokenizedLine = tokenizedLineForRow(editor, lineNumber);
    if (typeof tokenizedLine === 'undefined') {
      break;
    }
    checkLineTokens(tokenizedLine.tokens);
    if (foundRange) {
      return foundRange;
    }
    lineNumber += 1;
  }

  // Unable to determine the range for some reason
  return null;
}

function canValidate(path, text) {
  return text.length > 8 &&
    /"?swagger"?\s*:\s*['"]\d+\.\d+['"]/g.test(text);
}

function errorsToLinterMessages(err, path, editor) {
  const errObj = err.toJSON();
  if (!errObj.details) {
    return [{
      type: 'Error',
      text: errObj.message,
      filePath: path,
      range: generateRange(editor),
    }];
  }
  return errObj.details.map((detail) => {
    if (detail.code === 'ONE_OF_MISSING' && detail.inner) {
      const errors = detail.inner.map(innerDetail => (
        {
          type: 'Error',
          text: innerDetail.message,
          filePath: path,
          range: extractRange(innerDetail.path, editor),
        }
      )).valueOf();
      return errors;
    }
    return [{
      type: 'Error',
      text: detail.message,
      filePath: path,
      range: extractRange(detail.path, editor),
    }];
  })[0];
}

export default async function tryValidate(editor) {
  const path = editor.getPath();
  const text = editor.getText();
  if (!canValidate(path, text)) {
    return [];
  }

  const swaggerParserOpts = {
    validate: {
      // Validate against the Swagger 2.0 spec
      // https://github.com/BigstickCarpet/swagger-parser/blob/master/docs/options.md
      spec: true,
    },
  };

  try {
    await SwaggerParser.validate(path, swaggerParserOpts);
    return [];
  } catch (err) {
    if (editor.getText() !== text) {
      // Editor contents have changed, tell Linter not to update messages
      return null;
    }
    const linterMessages = errorsToLinterMessages(err, path, editor);
    return linterMessages;
  }
}
