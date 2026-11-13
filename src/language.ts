export { parseArchiMate, validateArchiMate, ArchiMateError, relationshipConnectors } from './archimate/parser.js';
export type {
  ArchiMateDiagnostic,
  ArchiMateErrorCode,
  ArchiMateErrorDiagnostic,
  ArchiMateParseOptions,
  ArchiMateSourceRange,
  ArchiMateValidationResult,
  ArchiMateWarningCode,
  ArchiMateWarningDiagnostic,
} from './archimate/parser.js';
export {
  elementTypes,
  getElementType,
  relationshipNames,
  relationshipTypes,
} from './archimate/catalogue.js';
export type { AccessMode, SpecifiedAccessMode, ElementAspect, ElementType, RelationshipType } from './archimate/catalogue.js';
export type {
  ArchiMateDirection,
  ArchiMateElement,
  ArchiMateLayout,
  ArchiMateModel,
  ArchiMateNesting,
  ArchiMateNote,
  ArchiMateRelationship,
} from './archimate/model.js';
