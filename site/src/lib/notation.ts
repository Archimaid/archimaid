import { getElementType, type ElementType } from 'archimaid/language';

type ElementDefinition = NonNullable<ReturnType<typeof getElementType>>;
type ElementCategory = ElementDefinition['category'];
type Notation = NonNullable<ElementDefinition['notation']>;

export type Layer = 'strategy' | 'business' | 'application' | 'technology' | 'implementation' | 'motivation' | 'composite';

const layerOfCategory: Record<ElementCategory, Layer> = {
  motivation: 'motivation',
  strategy: 'strategy',
  business: 'business',
  application: 'application',
  technology: 'technology',
  physical: 'technology',
  implementationAndMigration: 'implementation',
  composite: 'composite',
};

export interface ElementNotation {
  readonly name: string;
  readonly layer: Layer;
  readonly outline: Notation['outline'];
  readonly icon: NonNullable<Notation['icon']>;
}

export function elementNotation(type: ElementType): ElementNotation {
  const definition = getElementType(type);
  if (!definition?.notation) throw new Error(`The catalogue has no notation for "${type}".`);
  return {
    name: definition.name,
    layer: layerOfCategory[definition.category],
    outline: definition.notation.outline,
    icon: definition.notation.icon ?? [],
  };
}
