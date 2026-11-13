# ArchiMate type reference

Generated from the catalogue by `npm run reference`. Do not edit by hand.

## Element types (60)

| Key | Name | Layer | Aspect | Description |
| --- | --- | --- | --- | --- |
| `stakeholder` | Stakeholder | Motivation | Motivation | A party with interests in the architecture and its effects. |
| `driver` | Driver | Motivation | Motivation | A condition that prompts change and shapes goals. |
| `assessment` | Assessment | Motivation | Motivation | A finding about the current situation in light of a driver. |
| `goal` | Goal | Motivation | Motivation | A desired state or direction for the organisation. |
| `outcome` | Outcome | Motivation | Motivation | A result produced by a state of affairs or by a change. |
| `principle` | Principle | Motivation | Motivation | A general rule or intent that guides architecture choices. |
| `requirement` | Requirement | Motivation | Motivation | A need that the architecture describes for a particular system. |
| `constraint` | Constraint | Motivation | Motivation | A limit on the architecture, its implementation or its realisation. |
| `meaning` | Meaning | Motivation | Motivation | An interpretation of a concept in its particular context. |
| `value` | Value | Motivation | Motivation | The benefit, worth or significance attributed to a concept. |
| `resource` | Resource | Strategy | — | An asset under a person's or organisation's control. |
| `capability` | Capability | Strategy | Behavior | Something a person, organisation or system can do. |
| `valueStream` | Value Stream | Strategy | Behavior | A sequence of activities that produces value for a recipient. |
| `courseOfAction` | Course of Action | Strategy | Behavior | A plan for using capabilities and resources to reach a goal. |
| `businessActor` | Business Actor | Business | Active structure | A person, organisation or other business entity that can act. |
| `businessRole` | Business Role | Business | Active structure | A set of responsibilities a business actor can take on. |
| `businessCollaboration` | Business Collaboration | Business | Active structure | Business actors or roles working together to perform shared behaviour. |
| `businessInterface` | Business Interface | Business | Active structure | An access point for a business service. |
| `businessProcess` | Business Process | Business | Behavior | Ordered business activities that produce a result. |
| `businessFunction` | Business Function | Business | Behavior | Business activities grouped by criteria such as skills or resources. |
| `businessInteraction` | Business Interaction | Business | Behavior | Behaviour that business participants perform jointly. |
| `businessEvent` | Business Event | Business | Behavior | A change of state that matters to the business. |
| `businessService` | Business Service | Business | Behavior | Business behaviour exposed to its consumers. |
| `businessObject` | Business Object | Business | Passive structure | A concept that carries information in a business domain. |
| `contract` | Contract | Business | Passive structure | An agreement defining obligations and terms for a product or service. |
| `representation` | Representation | Business | Passive structure | A perceptible form in which a business object's information is expressed. |
| `product` | Product | Business | — | Services or passive structure bundled as an offering under an agreement. |
| `applicationComponent` | Application Component | Application | Active structure | A replaceable software module that encapsulates application functionality. |
| `applicationCollaboration` | Application Collaboration | Application | Active structure | Application components working together to perform shared behaviour. |
| `applicationInterface` | Application Interface | Application | Active structure | An access point for an application service. |
| `applicationFunction` | Application Function | Application | Behavior | Automated behaviour performed by an application component. |
| `applicationInteraction` | Application Interaction | Application | Behavior | Behaviour that application components perform jointly. |
| `applicationProcess` | Application Process | Application | Behavior | Ordered application activities that produce a result. |
| `applicationEvent` | Application Event | Application | Behavior | A change of state in an application. |
| `applicationService` | Application Service | Application | Behavior | Application behaviour exposed to its consumers. |
| `dataObject` | Data Object | Application | Passive structure | Information organised for automated processing. |
| `node` | Node | Technology | Active structure | A computational or physical resource that hosts or interacts with other resources. |
| `device` | Device | Technology | Active structure | Physical IT equipment that can host software or artifacts. |
| `systemSoftware` | System Software | Technology | Active structure | Software that supplies an environment for running software or using data. |
| `technologyCollaboration` | Technology Collaboration | Technology | Active structure | Technology resources working together to perform shared behaviour. |
| `technologyInterface` | Technology Interface | Technology | Active structure | An access point for a technology service. |
| `path` | Path | Technology | Active structure | A link through which technology resources can exchange information, energy or material. |
| `communicationNetwork` | Communication Network | Technology | Active structure | Infrastructure that connects devices or system software to transmit and route data. |
| `technologyFunction` | Technology Function | Technology | Behavior | A group of activities performed by a technology resource. |
| `technologyProcess` | Technology Process | Technology | Behavior | Ordered technology activities that produce a result. |
| `technologyInteraction` | Technology Interaction | Technology | Behavior | Behaviour that technology resources perform jointly. |
| `technologyEvent` | Technology Event | Technology | Behavior | A change of state in the technology layer. |
| `technologyService` | Technology Service | Technology | Behavior | Technology behaviour exposed to its consumers. |
| `artifact` | Artifact | Technology | Passive structure | A piece of data used or produced when developing, deploying or running a system. |
| `equipment` | Equipment | Physical | Active structure | Machinery, tools or instruments that act on physical material. |
| `facility` | Facility | Physical | Active structure | A physical structure or environment used in operations. |
| `distributionNetwork` | Distribution Network | Physical | Active structure | Infrastructure that carries material or energy between physical points. |
| `material` | Material | Physical | Passive structure | Physical matter or energy involved in the architecture. |
| `workPackage` | Work Package | Implementation & Migration | Behavior | A bounded set of actions planned to produce a result. |
| `deliverable` | Deliverable | Implementation & Migration | Passive structure | An identified result produced by a work package. |
| `implementationEvent` | Implementation Event | Implementation & Migration | Behavior | A change of state during implementation or migration. |
| `plateau` | Plateau | Implementation & Migration | — | A relatively stable architecture state within a period of time. |
| `gap` | Gap | Implementation & Migration | — | A difference between two architecture plateaus. |
| `grouping` | Grouping | Composite | — | A collection of concepts that share a common characteristic. |
| `location` | Location | Composite | — | A physical or conceptual place where concepts are situated or behaviour occurs. |

## Relationship types (11)

The left endpoint of a shorthand connector is always the model source.

| Key | Name | Shorthand |
| --- | --- | --- |
| `composition` | Composition | `*--` |
| `aggregation` | Aggregation | `o--` |
| `assignment` | Assignment | `@==>` |
| `realization` | Realization | `..\|>` |
| `serving` | Serving | `-->` |
| `access` | Access | `..`, `<..` (read), `..>` (write), `<..>` (readWrite) |
| `influence` | Influence | `-.->` |
| `association` | Association | `---`, `--/` (directed) |
| `triggering` | Triggering | `==>` |
| `flow` | Flow | `-.=>` |
| `specialization` | Specialization | `--\|>` |

## Source and trademark

The element and relationship types follow the [ArchiMate® 3.2 Specification (C226)](https://publications.opengroup.org/standards/archimate/c226) © The Open Group. The descriptions are summaries written for this project, not text from the specification. Archimaid is an independent project and is not affiliated with or endorsed by The Open Group. ArchiMate is a registered trademark of The Open Group in the United States and other countries.
