import {
  FileRequestObjectType,
  ParameterType,
  PathParametersResponseType,
  RequestBodyType,
  SchemaType,
} from '../Types';
import { ZodValidatorProps } from '../ZodValidator';
import {
  AnyZodObject,
  ZodArray,
  ZodEffects,
  ZodObject,
  ZodType,
  ZodUnion,
} from 'zod';
import { GetFormatFromZodType, GetTypeFromZodType } from './Zod.Utils';

export const FillSchemaParameters = (
  options: PathParametersResponseType,
  schema?: ZodValidatorProps,
) => {
  if (schema) {
    schema.params &&
      FillSchemaParameter(options.parameters, schema.params, 'path');
    schema.query &&
      FillSchemaParameter(options.parameters, schema.query, 'query');
    schema.header &&
      FillSchemaParameter(options.parameters, schema.header, 'header');
    if (schema.body) {
      options.requestBody = FillSchemaBody(schema.body, schema.files);
    }
  }
};

const FillSchemaParameter = (
  parameters: ParameterType[],
  object: AnyZodObject | ZodEffects<AnyZodObject>,
  type: string,
) => {
  if (object instanceof ZodEffects) {
    object = object.innerType();
  }
  for (const key in object.shape) {
    let zodType = object.shape[key] as ZodType;
    if (zodType instanceof ZodUnion) {
      zodType = zodType.options[0];
    }
    if (zodType instanceof ZodObject) {
      FillSchemaParameter(parameters, zodType, type);
      continue;
    }
    const isRequiredFlag = !zodType.isOptional();
    const { type: _type, zodType: _zodType } = GetTypeFromZodType(zodType);
    const parameter: ParameterType = {
      in: type,
      name: key,
      schema: {
        type: _type,
      },
      required: isRequiredFlag,
    };
    if (_zodType instanceof ZodArray) {
      parameter.explode = true;
      parameter.schema.items = {
        type: GetTypeFromZodType(_zodType.element).type,
      };
    }
    parameters.push(parameter);
  }
};
export const FillSchemaBody = (
  object: AnyZodObject | ZodEffects<AnyZodObject>,
  files?: FileRequestObjectType,
): RequestBodyType | undefined => {
  const hasFiles = files && Object.keys(files).length > 0;
  const contentType = hasFiles ? 'multipart/form-data' : 'application/json';
  const schema = GenerateSchemaBody(object);
  if (hasFiles) {
    GenerateSchemaBodyFiles(files, schema);
  }
  return {
    content: {
      [contentType]: {
        schema,
      },
    },
  };
};

export const GenerateSchemaBody = (
  object: AnyZodObject | ZodEffects<AnyZodObject>,
  parentObject?: SchemaType,
): SchemaType => {
  const bodySchema: SchemaType = {
    type: 'object',
  };
  if (object instanceof ZodEffects) {
    object = object.innerType();
  }
  for (const key in object.shape) {
    const zodType = object.shape[key] as ZodType;
    const { type: _type } = GetTypeFromZodType(zodType);
    if (!bodySchema.properties) bodySchema.properties = {};
    bodySchema.properties[key] = {
      type: _type,
      format: GetFormatFromZodType(zodType),
    };
    if (zodType instanceof ZodArray) {
      bodySchema.properties[key].items = {
        type: GetTypeFromZodType(zodType.element).type,
      };
      GenerateSchemaBody(zodType.element, bodySchema.properties[key].items);
    }
    const isRequiredFlag = !zodType.isOptional();
    if (isRequiredFlag) {
      if (!bodySchema.required) bodySchema.required = [];
      bodySchema.required.push(key);
    }
    if (zodType instanceof ZodObject) {
      GenerateSchemaBody(zodType, bodySchema.properties[key]);
    }
  }
  if (parentObject) {
    parentObject.required = bodySchema.required;
    parentObject.properties = bodySchema.properties;
    parentObject.type = 'object';
  }
  return bodySchema;
};

const GenerateSchemaBodyFiles = (
  files: FileRequestObjectType,
  schema: SchemaType,
) => {
  if (!schema.properties) {
    schema.properties = {};
  }
  if (!schema.required) {
    schema.required = [];
  }
  for (const [key, file] of Object.entries(files)) {
    if (file === false) {
      continue;
    }
    if (file === true) {
      schema.properties[key] = {
        type: 'string',
        format: 'binary',
      };
      schema.required.push(key);
      continue;
    }
    if (file.multiple) {
      schema.properties[key] = {
        type: 'array',
        items: {
          type: 'string',
          format: 'binary',
        },
      };
    } else {
      schema.properties[key] = {
        type: 'string',
        format: 'binary',
      };
    }
    if (file.optional !== true) {
      schema.required.push(key);
    }
  }
  return schema;
};
