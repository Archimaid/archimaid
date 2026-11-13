export type ElementCategory =
  | "motivation"
  | "strategy"
  | "business"
  | "application"
  | "technology"
  | "physical"
  | "implementationAndMigration"
  | "composite";

export type ElementAspect = "passiveStructure" | "behavior" | "activeStructure" | "motivation";

export type ElementOutline = "rectangle" | "rounded" | "chamfered" | "grouping";

export interface IconPath {
  readonly d: string;
  readonly fill?: "none" | "ink";
}

export interface ElementTypeDefinition {
  readonly name: string;
  readonly description: string;
  readonly category: ElementCategory;
  readonly aspect: ElementAspect | null;
  readonly notation?: {
    readonly outline: ElementOutline;
    readonly icon?: readonly IconPath[];
  };
}

export const relationshipStroke = "#000000";

// Original drawings of the default corner symbols, on a 16 × 16 coordinate grid.
const icons = {
  role: [{ d: "M4 3H12A3 5 0 0 1 12 13H4A3 5 0 0 1 4 3Z M12 3A3 5 0 0 0 12 13" }],
  driver: [
    { d: "M8 2A6 6 0 1 1 8 14A6 6 0 1 1 8 2Z M8 0.5V15.5 M0.5 8H15.5 M2.5 2.5L13.5 13.5 M13.5 2.5L2.5 13.5" },
    { d: "M8 6.5A1.5 1.5 0 1 1 8 9.5A1.5 1.5 0 1 1 8 6.5Z", fill: "ink" },
  ],
  assessment: [{ d: "M9.8 1.5A4.8 4.8 0 1 1 9.8 11.1A4.8 4.8 0 1 1 9.8 1.5Z M6.3 9.7L1.5 14.5" }],
  goal: [
    { d: "M8 1A7 7 0 1 1 8 15A7 7 0 1 1 8 1Z M8 3.7A4.3 4.3 0 1 1 8 12.3A4.3 4.3 0 1 1 8 3.7Z" },
    { d: "M8 6.2A1.8 1.8 0 1 1 8 9.8A1.8 1.8 0 1 1 8 6.2Z", fill: "ink" },
  ],
  outcome: [
    { d: "M6 5A5 5 0 1 1 6 15A5 5 0 1 1 6 5Z M6 7A3 3 0 1 1 6 13A3 3 0 1 1 6 7Z" },
    { d: "M14 2L6 10 M6 7V10H9" },
  ],
  principle: [
    { d: "M3 1.5H13Q14.5 1.5 14.5 3V13Q14.5 14.5 13 14.5H3Q1.5 14.5 1.5 13V3Q1.5 1.5 3 1.5Z" },
    { d: "M7.4 4.1H8.6L8.2 9.3H7.8Z M8 11.3A0.7 0.7 0 1 1 8 12.7A0.7 0.7 0 1 1 8 11.3Z", fill: "ink" },
  ],
  requirement: [{ d: "M4 3.5H15L12 12.5H1Z" }],
  constraint: [{ d: "M4 3.5H15L12 12.5H1Z M6.1 3.5L3.1 12.5" }],
  meaning: [{ d: "M4.5 10.5C2.5 10.2 2.2 8 3.7 7.2C2.5 5.3 4.5 3.4 6.3 4.2C7.4 2.8 9.4 2.9 10.4 4.1C12 3.2 14.5 4.2 14 6.3C16 7.6 14.6 10.2 12.9 10.4C12.5 12 10.2 12.3 9.1 11.3C7.8 12.2 5.5 12.2 4.5 10.5Z M3 12A1 1 0 1 1 3 14A1 1 0 1 1 3 12Z M1 14.5H1.1" }],
  value: [{ d: "M8 3.2A7 4.8 0 1 1 8 12.8A7 4.8 0 1 1 8 3.2Z" }],
  resource: [{ d: "M2.5 4H12Q13 4 13 5V11Q13 12 12 12H2.5Q1 12 1 10.5V5.5Q1 4 2.5 4Z M13 6H15V10H13 M4.3 6V10 M7 6V10 M9.7 6V10" }],
  capability: [{ d: "M1 10H5V6H9V2H14V14H1Z M5 10V14 M9 6V14 M5 10H14 M9 6H14" }],
  valueStream: [{ d: "M1 3H9.5L15 8L9.5 13H1L6.5 8Z" }],
  courseOfAction: [
    { d: "M10.5 1A4.5 4.5 0 1 1 10.5 10A4.5 4.5 0 1 1 10.5 1Z M10.5 3A2.5 2.5 0 1 1 10.5 8A2.5 2.5 0 1 1 10.5 3Z" },
    { d: "M1.5 14.5L7.3 8.7 M4.3 8.7H7.3V11.7" },
  ],
  actor: [{ d: "M8 1A2.6 2.6 0 1 1 8 6.2A2.6 2.6 0 1 1 8 1Z M8 6.2V10.7 M4.2 7.7H11.8 M8 10.7L4.4 15 M8 10.7L11.6 15" }],
  collaboration: [{ d: "M6 3A5 5 0 1 1 6 13A5 5 0 1 1 6 3Z M10 3A5 5 0 1 1 10 13A5 5 0 1 1 10 3Z" }],
  interface: [{ d: "M1 8H6 M10.5 3.5A4.5 4.5 0 1 1 10.5 12.5A4.5 4.5 0 1 1 10.5 3.5Z" }],
  process: [{ d: "M1 6H9V2L15 8L9 14V10H1Z" }],
  function: [{ d: "M1.5 7L8 2L14.5 7V13L8 8L1.5 13Z" }],
  interaction: [{ d: "M6.5 2V14A6 6 0 0 1 6.5 2Z M9.5 2V14A6 6 0 0 0 9.5 2Z" }],
  event: [{ d: "M1.5 3H10A5 5 0 0 1 10 13H1.5L4.5 8Z" }],
  service: [{ d: "M5 3.5H11A4.5 4.5 0 0 1 11 12.5H5A4.5 4.5 0 0 1 5 3.5Z" }],
  object: [{ d: "M1.5 3H14.5V13H1.5Z M1.5 6H14.5" }],
  contract: [{ d: "M1.5 3H14.5V13H1.5Z M1.5 5.7H14.5 M1.5 10.3H14.5" }],
  representation: [{ d: "M1.5 3H14.5V12Q11.3 8.7 8 12Q4.7 15.3 1.5 12Z M1.5 6H14.5" }],
  product: [{ d: "M1.5 3H14.5V13H1.5Z M8 3V7H1.5" }],
  component: [{ d: "M4.5 4.8V2H14V14H4.5V11.2 M4.5 9V7 M1 4.8H7V7H1Z M1 9H7V11.2H1Z" }],
  node: [{ d: "M1.5 4.5L4.5 1.5H14.5V11.5L11.5 14.5H1.5Z M1.5 4.5H11.5L14.5 1.5 M11.5 4.5V14.5" }],
  device: [{ d: "M3 2.5H13Q14.5 2.5 14.5 4V10Q14.5 11.5 13 11.5H3Q1.5 11.5 1.5 10V4Q1.5 2.5 3 2.5Z M3 11.5L1.5 14H14.5L13 11.5" }],
  systemSoftware: [{ d: "M4.3 6A5.2 5.2 0 1 1 12 12 M7 5A5.2 5.2 0 1 1 7 15.4A5.2 5.2 0 1 1 7 5Z" }],
  path: [{ d: "M5.4 3.7L1 8L5.4 12.3 M10.6 3.7L15 8L10.6 12.3 M4.8 8H6.6 M9.4 8H11.2" }],
  communicationNetwork: [
    { d: "M4.5 3H13L11.5 13H3Z" },
    { d: "M4.5 1.4A1.6 1.6 0 1 1 4.5 4.6A1.6 1.6 0 1 1 4.5 1.4Z M13 1.4A1.6 1.6 0 1 1 13 4.6A1.6 1.6 0 1 1 13 1.4Z M11.5 11.4A1.6 1.6 0 1 1 11.5 14.6A1.6 1.6 0 1 1 11.5 11.4Z M3 11.4A1.6 1.6 0 1 1 3 14.6A1.6 1.6 0 1 1 3 11.4Z", fill: "ink" },
  ],
  artifact: [{ d: "M2.5 1.5H9.5L13.5 5.5V14.5H2.5Z M9.5 1.5V5.5H13.5" }],
  equipment: [
    { d: "M6 5L7 4L9 4.5L9.5 6.3L11.2 7L12.7 6.5L14 8L13.5 9.8L14.5 11.2L13.5 13L11.7 12.8L10.2 14L10 15L7.8 15L7.2 13.8L5.5 13L4.1 13.6L2.6 12.1L3.4 10.6L2.5 9L2.8 7.4L4.7 7.4Z M8.5 7A2.7 2.7 0 1 1 8.5 12.4A2.7 2.7 0 1 1 8.5 7Z" },
    { d: "M9.5 3L10 1.8L11.4 2L12.2 0.9L13.5 1.5L13.5 2.8L14.8 3.5L14.4 4.8L13.2 4.9L12.7 6 M12.2 2.8A1.4 1.4 0 1 1 12.2 5.6A1.4 1.4 0 1 1 12.2 2.8Z" },
  ],
  facility: [{ d: "M1.5 2H4V9L7.5 7V9L11 7V9L14.5 7V14H1.5Z" }],
  distributionNetwork: [{ d: "M4.5 4L1 8L4.5 12 M11.5 4L15 8L11.5 12 M2.5 6.5H13.5 M2.5 9.5H13.5" }],
  material: [{ d: "M4.5 2H11.5L15 8L11.5 14H4.5L1 8Z M3.5 8L6 4 M10 4L12.5 8 M6 12H10" }],
  workPackage: [{ d: "M8.7 11.1C12.4 8.6 11.1 2.5 6.5 2.5C0.4 2.5 0.1 12.9 6.8 12.9H14.5 M14.5 12.9L11.6 10.7 M14.5 12.9L11.6 15.1" }],
  deliverable: [{ d: "M1.5 3H14.5V12Q11.3 8.7 8 12Q4.7 15.3 1.5 12Z" }],
  plateau: [
    { d: "M5 3H15V4.3H5Z M3 7.3H13V8.6H3Z M1 11.6H11V12.9H1Z", fill: "ink" },
  ],
  gap: [{ d: "M8 2.5A5.5 5.5 0 1 1 8 13.5A5.5 5.5 0 1 1 8 2.5Z M0.5 6.2H15.5 M0.5 9.8H15.5" }],
  grouping: [{ d: "M1.5 13V10 M1.5 8.5V5.5 M1.5 4V2H4.5 M6 2H9 M10.5 2H12V5.5 M12 6H15V9 M15 10.5V13H12 M10.5 13H7.5 M6 13H3 M2 6H5 M6.5 6H9.5" }],
  location: [{ d: "M8 1.5A4.5 4.5 0 0 1 12.5 6C12.5 9 9.7 10.5 8 14.7C6.3 10.5 3.5 9 3.5 6A4.5 4.5 0 0 1 8 1.5Z" }],
} as const satisfies Record<string, readonly IconPath[]>;

function element(
  name: string,
  description: string,
  category: ElementCategory,
  aspect: ElementAspect | null,
  outline: ElementOutline,
  icon: keyof typeof icons,
): ElementTypeDefinition {
  return { name, description, category, aspect, notation: { outline, icon: icons[icon] } };
}

export const elementTypes = {
  stakeholder: element("Stakeholder", "A party with interests in the architecture and its effects.", "motivation", "motivation", "chamfered", "role"),
  driver: element("Driver", "A condition that prompts change and shapes goals.", "motivation", "motivation", "chamfered", "driver"),
  assessment: element("Assessment", "A finding about the current situation in light of a driver.", "motivation", "motivation", "chamfered", "assessment"),
  goal: element("Goal", "A desired state or direction for the organisation.", "motivation", "motivation", "chamfered", "goal"),
  outcome: element("Outcome", "A result produced by a state of affairs or by a change.", "motivation", "motivation", "chamfered", "outcome"),
  principle: element("Principle", "A general rule or intent that guides architecture choices.", "motivation", "motivation", "chamfered", "principle"),
  requirement: element("Requirement", "A need that the architecture describes for a particular system.", "motivation", "motivation", "chamfered", "requirement"),
  constraint: element("Constraint", "A limit on the architecture, its implementation or its realisation.", "motivation", "motivation", "chamfered", "constraint"),
  meaning: element("Meaning", "An interpretation of a concept in its particular context.", "motivation", "motivation", "chamfered", "meaning"),
  value: element("Value", "The benefit, worth or significance attributed to a concept.", "motivation", "motivation", "chamfered", "value"),
  resource: element("Resource", "An asset under a person's or organisation's control.", "strategy", null, "rectangle", "resource"),
  capability: element("Capability", "Something a person, organisation or system can do.", "strategy", "behavior", "rounded", "capability"),
  valueStream: element("Value Stream", "A sequence of activities that produces value for a recipient.", "strategy", "behavior", "rounded", "valueStream"),
  courseOfAction: element("Course of Action", "A plan for using capabilities and resources to reach a goal.", "strategy", "behavior", "rounded", "courseOfAction"),
  businessActor: element("Business Actor", "A person, organisation or other business entity that can act.", "business", "activeStructure", "rectangle", "actor"),
  businessRole: element("Business Role", "A set of responsibilities a business actor can take on.", "business", "activeStructure", "rectangle", "role"),
  businessCollaboration: element("Business Collaboration", "Business actors or roles working together to perform shared behaviour.", "business", "activeStructure", "rectangle", "collaboration"),
  businessInterface: element("Business Interface", "An access point for a business service.", "business", "activeStructure", "rectangle", "interface"),
  businessProcess: element("Business Process", "Ordered business activities that produce a result.", "business", "behavior", "rounded", "process"),
  businessFunction: element("Business Function", "Business activities grouped by criteria such as skills or resources.", "business", "behavior", "rounded", "function"),
  businessInteraction: element("Business Interaction", "Behaviour that business participants perform jointly.", "business", "behavior", "rounded", "interaction"),
  businessEvent: element("Business Event", "A change of state that matters to the business.", "business", "behavior", "rounded", "event"),
  businessService: element("Business Service", "Business behaviour exposed to its consumers.", "business", "behavior", "rounded", "service"),
  businessObject: element("Business Object", "A concept that carries information in a business domain.", "business", "passiveStructure", "rectangle", "object"),
  contract: element("Contract", "An agreement defining obligations and terms for a product or service.", "business", "passiveStructure", "rectangle", "contract"),
  representation: element("Representation", "A perceptible form in which a business object's information is expressed.", "business", "passiveStructure", "rectangle", "representation"),
  product: element("Product", "Services or passive structure bundled as an offering under an agreement.", "business", null, "rectangle", "product"),
  applicationComponent: element("Application Component", "A replaceable software module that encapsulates application functionality.", "application", "activeStructure", "rectangle", "component"),
  applicationCollaboration: element("Application Collaboration", "Application components working together to perform shared behaviour.", "application", "activeStructure", "rectangle", "collaboration"),
  applicationInterface: element("Application Interface", "An access point for an application service.", "application", "activeStructure", "rectangle", "interface"),
  applicationFunction: element("Application Function", "Automated behaviour performed by an application component.", "application", "behavior", "rounded", "function"),
  applicationInteraction: element("Application Interaction", "Behaviour that application components perform jointly.", "application", "behavior", "rounded", "interaction"),
  applicationProcess: element("Application Process", "Ordered application activities that produce a result.", "application", "behavior", "rounded", "process"),
  applicationEvent: element("Application Event", "A change of state in an application.", "application", "behavior", "rounded", "event"),
  applicationService: element("Application Service", "Application behaviour exposed to its consumers.", "application", "behavior", "rounded", "service"),
  dataObject: element("Data Object", "Information organised for automated processing.", "application", "passiveStructure", "rectangle", "object"),
  node: element("Node", "A computational or physical resource that hosts or interacts with other resources.", "technology", "activeStructure", "rectangle", "node"),
  device: element("Device", "Physical IT equipment that can host software or artifacts.", "technology", "activeStructure", "rectangle", "device"),
  systemSoftware: element("System Software", "Software that supplies an environment for running software or using data.", "technology", "activeStructure", "rectangle", "systemSoftware"),
  technologyCollaboration: element("Technology Collaboration", "Technology resources working together to perform shared behaviour.", "technology", "activeStructure", "rectangle", "collaboration"),
  technologyInterface: element("Technology Interface", "An access point for a technology service.", "technology", "activeStructure", "rectangle", "interface"),
  path: element("Path", "A link through which technology resources can exchange information, energy or material.", "technology", "activeStructure", "rectangle", "path"),
  communicationNetwork: element("Communication Network", "Infrastructure that connects devices or system software to transmit and route data.", "technology", "activeStructure", "rectangle", "communicationNetwork"),
  technologyFunction: element("Technology Function", "A group of activities performed by a technology resource.", "technology", "behavior", "rounded", "function"),
  technologyProcess: element("Technology Process", "Ordered technology activities that produce a result.", "technology", "behavior", "rounded", "process"),
  technologyInteraction: element("Technology Interaction", "Behaviour that technology resources perform jointly.", "technology", "behavior", "rounded", "interaction"),
  technologyEvent: element("Technology Event", "A change of state in the technology layer.", "technology", "behavior", "rounded", "event"),
  technologyService: element("Technology Service", "Technology behaviour exposed to its consumers.", "technology", "behavior", "rounded", "service"),
  artifact: element("Artifact", "A piece of data used or produced when developing, deploying or running a system.", "technology", "passiveStructure", "rectangle", "artifact"),
  equipment: element("Equipment", "Machinery, tools or instruments that act on physical material.", "physical", "activeStructure", "rectangle", "equipment"),
  facility: element("Facility", "A physical structure or environment used in operations.", "physical", "activeStructure", "rectangle", "facility"),
  distributionNetwork: element("Distribution Network", "Infrastructure that carries material or energy between physical points.", "physical", "activeStructure", "rectangle", "distributionNetwork"),
  material: element("Material", "Physical matter or energy involved in the architecture.", "physical", "passiveStructure", "rectangle", "material"),
  workPackage: element("Work Package", "A bounded set of actions planned to produce a result.", "implementationAndMigration", "behavior", "rounded", "workPackage"),
  deliverable: element("Deliverable", "An identified result produced by a work package.", "implementationAndMigration", "passiveStructure", "rectangle", "deliverable"),
  implementationEvent: element("Implementation Event", "A change of state during implementation or migration.", "implementationAndMigration", "behavior", "rounded", "event"),
  plateau: element("Plateau", "A relatively stable architecture state within a period of time.", "implementationAndMigration", null, "rectangle", "plateau"),
  gap: element("Gap", "A difference between two architecture plateaus.", "implementationAndMigration", null, "rectangle", "gap"),
  grouping: element("Grouping", "A collection of concepts that share a common characteristic.", "composite", null, "grouping", "grouping"),
  location: element("Location", "A physical or conceptual place where concepts are situated or behaviour occurs.", "composite", null, "rectangle", "location"),
} as const satisfies Record<string, ElementTypeDefinition>;

export type ElementType = keyof typeof elementTypes;

export function getElementType(type: string): ElementTypeDefinition | undefined {
  return Object.hasOwn(elementTypes, type) ? elementTypes[type as ElementType] : undefined;
}

export type AccessMode = "read" | "write" | "readWrite" | "unspecified";
export type RelationshipMarker =
  | "none"
  | "filledDiamond"
  | "openDiamond"
  | "filledDot"
  | "openArrow"
  | "filledArrow"
  | "openTriangle"
  | "singleBarb";

export interface RelationshipNotation {
  readonly line: "solid" | "dashed" | "dotted";
  readonly start: RelationshipMarker;
  readonly end: RelationshipMarker;
}

export const relationshipTypes = [
  "composition",
  "aggregation",
  "assignment",
  "realization",
  "serving",
  "access",
  "influence",
  "association",
  "triggering",
  "flow",
  "specialization",
] as const;

export type RelationshipType = (typeof relationshipTypes)[number];

export const relationshipNames = {
  composition: "Composition",
  aggregation: "Aggregation",
  assignment: "Assignment",
  realization: "Realization",
  serving: "Serving",
  access: "Access",
  influence: "Influence",
  association: "Association",
  triggering: "Triggering",
  flow: "Flow",
  specialization: "Specialization",
} as const satisfies Record<RelationshipType, string>;

// Markers are indexed by model source and target.
const relationshipNotation = {
  composition: { line: "solid", start: "filledDiamond", end: "none" },
  aggregation: { line: "solid", start: "openDiamond", end: "none" },
  assignment: { line: "solid", start: "filledDot", end: "filledArrow" },
  realization: { line: "dotted", start: "none", end: "openTriangle" },
  serving: { line: "solid", start: "none", end: "openArrow" },
  access: { line: "dotted", start: "none", end: "none" },
  influence: { line: "dashed", start: "none", end: "openArrow" },
  association: { line: "solid", start: "none", end: "none" },
  triggering: { line: "solid", start: "none", end: "filledArrow" },
  flow: { line: "dashed", start: "none", end: "filledArrow" },
  specialization: { line: "solid", start: "none", end: "openTriangle" },
} as const satisfies Record<RelationshipType, RelationshipNotation>;

export function getRelationshipNotation(
  type: string,
  access: AccessMode = "unspecified",
  directed = false,
): RelationshipNotation | undefined {
  if (type === "access") {
    return {
      line: "dotted",
      start: access === "read" || access === "readWrite" ? "openArrow" : "none",
      end: access === "write" || access === "readWrite" ? "openArrow" : "none",
    };
  }
  if (type === "association" && directed) {
    return { line: "solid", start: "none", end: "singleBarb" };
  }
  return Object.hasOwn(relationshipNotation, type)
    ? relationshipNotation[type as RelationshipType]
    : undefined;
}
