export { parseArchiMate, ArchiMateError } from './archimate/parser.js';
export type { ArchiMateErrorCode, ArchiMateParseOptions } from './archimate/parser.js';
export {
  elementTypes,
  getElementType,
  relationshipTypes,
} from './archimate/catalogue.js';
export type { AccessMode, ElementType, RelationshipType } from './archimate/catalogue.js';
export type {
  ArchiMateDirection,
  ArchiMateElement,
  ArchiMateModel,
  ArchiMateNesting,
  ArchiMateNote,
  ArchiMateRelationship,
} from './archimate/model.js';
