export { parseArchiMate, ArchiMateError } from './archimate/parser.js';
export type { ArchiMateErrorCode, ArchiMateParseOptions } from './archimate/parser.js';
export {
  elementTypes,
  getElementType,
  relationshipTypes,
} from './archimate/catalogue.js';
export type { AccessMode, ElementAspect, ElementType, RelationshipType } from './archimate/catalogue.js';
export type {
  ArchiMateDirection,
  ArchiMateElement,
  ArchiMateLayout,
  ArchiMateModel,
  ArchiMateNesting,
  ArchiMateNote,
  ArchiMateRelationship,
} from './archimate/model.js';
