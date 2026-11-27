import { CstParser, EOF, defaultParserErrorProvider } from 'chevrotain';
import type { CstNode, IParserErrorMessageProvider, IRecognitionException, IToken, TokenType } from 'chevrotain';
import {
  access,
  accDescrBlock,
  arrow,
  at,
  click,
  closeBrace,
  colon,
  connector,
  description,
  directed,
  direction,
  element,
  from,
  header,
  href,
  identifier,
  inside,
  integer,
  label,
  layout,
  metadata,
  nest,
  newline,
  note,
  on,
  openBrace,
  positions,
  quoted,
  relationship,
  size,
  sizeValue,
  to,
  tokens,
  via,
} from './lexer.js';

// A rule's own description replaces Chevrotain's "Expecting: … but found: …" wording.
const errorMessageProvider: IParserErrorMessageProvider = {
  ...defaultParserErrorProvider,
  buildNoViableAltMessage: (options) =>
    options.customUserDescription ?? defaultParserErrorProvider.buildNoViableAltMessage(options),
};

class ArchiMateParser extends CstParser {
  readonly document = this.RULE('document', () => {
    this.MANY(() => this.CONSUME(newline));
    this.CONSUME(header, { ERR_MSG: 'Expected the "archimate-beta" diagram header.' });
    this.MANY2(() => {
      this.CONSUME2(newline);
      this.OPTION(() => this.SUBRULE(this.statement));
    });
    this.CONSUME(EOF, {
      ERR_MSG:
        'Expected a new line or an ArchiMate declaration (layout, direction, element, description, relationship, connector, note, nest, click, positions, or metadata).',
    });
  });

  private readonly statement = this.RULE('statement', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.directionStatement) },
      { ALT: () => this.SUBRULE(this.layoutStatement) },
      { ALT: () => this.SUBRULE(this.elementStatement) },
      { ALT: () => this.SUBRULE(this.descriptionStatement) },
      { ALT: () => this.SUBRULE(this.relationshipStatement) },
      { ALT: () => this.SUBRULE(this.noteStatement) },
      { ALT: () => this.SUBRULE(this.nestingStatement) },
      { ALT: () => this.SUBRULE(this.clickStatement) },
      { ALT: () => this.SUBRULE(this.metadataStatement) },
      { ALT: () => this.SUBRULE(this.positionsStatement) },
      { ALT: () => this.SUBRULE(this.connectorStatement) },
    ]);
  });

  // Diagram settings stay at the top level, so a block holds only model declarations.
  private readonly blockStatement = this.RULE('blockStatement', () => {
    this.OR({
      DEF: [
        { ALT: () => this.SUBRULE(this.elementStatement) },
        { ALT: () => this.SUBRULE(this.descriptionStatement) },
        { ALT: () => this.SUBRULE(this.relationshipStatement) },
        { ALT: () => this.SUBRULE(this.noteStatement) },
        { ALT: () => this.SUBRULE(this.nestingStatement) },
        { ALT: () => this.SUBRULE(this.clickStatement) },
        { ALT: () => this.SUBRULE(this.connectorStatement) },
      ],
      ERR_MSG:
        'Expected "}" or a declaration inside the element block (element, description, relationship, connector, note, nest, or click).',
    });
  });

  private readonly connectorStatement = this.RULE('connectorStatement', () => {
    this.CONSUME(identifier, { LABEL: 'source' });
    this.CONSUME(connector, { LABEL: 'connector' });
    this.CONSUME2(identifier, { LABEL: 'target' });
    this.OPTION(() => {
      this.CONSUME(colon);
      this.CONSUME(quoted, { LABEL: 'labelText' });
    });
  });

  private readonly directionStatement = this.RULE('directionStatement', () => {
    this.CONSUME(direction);
    this.CONSUME(identifier, { LABEL: 'value' });
  });

  private readonly layoutStatement = this.RULE('layoutStatement', () => {
    this.CONSUME(layout);
    this.CONSUME(identifier, { LABEL: 'value' });
  });

  private readonly elementStatement = this.RULE('elementStatement', () => {
    this.CONSUME(element);
    this.CONSUME(identifier, { LABEL: 'type' });
    this.CONSUME2(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'name' });
    this.OPTION(() => {
      this.CONSUME(openBrace);
      this.MANY(() => {
        this.CONSUME(newline);
        this.OPTION2(() => this.SUBRULE(this.blockStatement));
      });
      this.CONSUME(closeBrace, { ERR_MSG: 'Expected "}" on its own line to close the element block.' });
    });
  });

  private readonly clickStatement = this.RULE('clickStatement', () => {
    this.CONSUME(click);
    this.CONSUME(identifier, { LABEL: 'id' });
    this.CONSUME(href);
    this.CONSUME(quoted, { LABEL: 'url' });
    this.OPTION(() => this.CONSUME2(quoted, { LABEL: 'tooltip' }));
    this.OPTION2(() => this.CONSUME2(identifier, { LABEL: 'target' }));
  });

  private readonly descriptionStatement = this.RULE('descriptionStatement', () => {
    this.CONSUME(description);
    this.CONSUME(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'value' });
  });

  private readonly relationshipStatement = this.RULE('relationshipStatement', () => {
    this.CONSUME(relationship);
    this.CONSUME(identifier, { LABEL: 'type' });
    this.CONSUME2(identifier, { LABEL: 'id' });
    this.CONSUME3(identifier, { LABEL: 'source' });
    this.CONSUME(arrow);
    this.CONSUME4(identifier, { LABEL: 'target' });
    this.OPTION(() => {
      this.CONSUME(access);
      this.CONSUME5(identifier, { LABEL: 'mode' });
    });
    this.OPTION2(() => this.CONSUME(directed));
    this.OPTION3(() => {
      this.CONSUME(label);
      this.CONSUME(quoted, { LABEL: 'labelText' });
    });
  });

  private readonly metadataStatement = this.RULE('metadataStatement', () => {
    this.OR([
      { ALT: () => this.CONSUME(metadata, { LABEL: 'value' }) },
      { ALT: () => this.CONSUME(accDescrBlock, { LABEL: 'value' }) },
    ]);
  });

  private readonly noteStatement = this.RULE('noteStatement', () => {
    this.CONSUME(note);
    this.CONSUME(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'text' });
    this.OPTION(() => {
      this.CONSUME(on);
      this.CONSUME2(identifier, { LABEL: 'anchor' });
    });
  });

  private readonly nestingStatement = this.RULE('nestingStatement', () => {
    this.CONSUME(nest);
    this.CONSUME(identifier, { LABEL: 'child' });
    this.CONSUME(inside);
    this.CONSUME2(identifier, { LABEL: 'parent' });
    this.OPTION(() => {
      this.CONSUME(via);
      this.CONSUME3(identifier, { LABEL: 'relationshipId' });
    });
  });

  // Layout stays in one block at the top level, so readers can skip it as a whole.
  private readonly positionsStatement = this.RULE('positionsStatement', () => {
    this.CONSUME(positions);
    this.CONSUME(openBrace);
    this.MANY(() => {
      this.CONSUME(newline);
      this.OPTION(() => this.SUBRULE(this.positionEntry));
    });
    this.CONSUME(closeBrace, { ERR_MSG: 'Expected "}" on its own line to close the positions block.' });
  });

  private readonly positionEntry = this.RULE('positionEntry', () => {
    this.CONSUME(identifier, { LABEL: 'subject' });
    this.OR({
      DEF: [
        {
          ALT: () => {
            this.CONSUME(at);
            this.CONSUME(integer, { LABEL: 'x' });
            this.CONSUME2(integer, { LABEL: 'y' });
            this.OPTION(() => {
              this.CONSUME(size);
              this.CONSUME(sizeValue, { LABEL: 'size' });
            });
          },
        },
        {
          ALT: () => {
            this.CONSUME(connector, { LABEL: 'connector' });
            this.CONSUME2(identifier, { LABEL: 'target' });
            this.SUBRULE(this.anchorSides);
          },
        },
        { ALT: () => this.SUBRULE2(this.anchorSides) },
      ],
      ERR_MSG:
        'Expected "at x y" after an element ID, or "from" or "to" sides after a relationship, inside the positions block.',
    });
  });

  private readonly anchorSides = this.RULE('anchorSides', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(from);
          this.CONSUME(identifier, { LABEL: 'sourceSide' });
          this.OPTION(() => {
            this.CONSUME(to);
            this.CONSUME2(identifier, { LABEL: 'targetSide' });
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME2(to);
          this.CONSUME3(identifier, { LABEL: 'targetSide' });
        },
      },
    ]);
  });

  constructor() {
    super(tokens, { errorMessageProvider });
    this.performSelfAnalysis();
  }
}

type Context = CstNode['children'];
export type Declaration =
  | { kind: 'direction'; value: IToken }
  | { kind: 'layout'; value: IToken }
  | { kind: 'metadata'; value: IToken }
  | { kind: 'element'; bounds: TokenBounds; type: IToken; id: IToken; name: IToken }
  | { kind: 'description'; bounds: TokenBounds; id: IToken; value: IToken }
  | { kind: 'note'; bounds: TokenBounds; id: IToken; text: IToken; on?: IToken; anchor?: IToken }
  | { kind: 'nesting'; child: IToken; parent: IToken; relationshipId?: IToken }
  | { kind: 'click'; bounds: TokenBounds; id: IToken; url: IToken; tooltip?: IToken; target?: IToken }
  | PositionsDeclaration
  | RelationshipDeclaration
  | ConnectorDeclaration;

// The first and last token of a statement, including the block of an element.
export interface TokenBounds {
  readonly first: IToken;
  readonly last: IToken;
}

export interface RelationshipDeclaration {
  kind: 'relationship';
  bounds: TokenBounds;
  type: IToken;
  id: IToken;
  source: IToken;
  target: IToken;
  accessKeyword?: IToken;
  mode?: IToken;
  directed?: IToken;
  labelMarker?: IToken;
  label?: IToken;
}

export interface ConnectorDeclaration {
  kind: 'connector';
  bounds: TokenBounds;
  source: IToken;
  connector: IToken;
  target: IToken;
  labelMarker?: IToken;
  label?: IToken;
}

export interface PositionsDeclaration {
  kind: 'positions';
  bounds: TokenBounds;
  keyword: IToken;
  entries: PositionEntry[];
}

export type PositionEntry = ElementPositionEntry | AnchorEntry;

export interface ElementPositionEntry {
  kind: 'elementPosition';
  bounds: TokenBounds;
  id: IToken;
  x: IToken;
  y: IToken;
  sizeKeyword?: IToken;
  size?: IToken;
}

// The relationship is named by its ID, or by its endpoints and connector as in the shorthand.
export interface AnchorEntry {
  kind: 'anchor';
  bounds: TokenBounds;
  subject: IToken;
  connector?: IToken;
  target?: IToken;
  fromKeyword?: IToken;
  sourceSide?: IToken;
  toKeyword?: IToken;
  targetSide?: IToken;
}

function requiredToken(ctx: Context, name: string): IToken {
  const item = ctx[name]?.[0];
  if (!item || !('tokenType' in item)) throw new Error('Incomplete ArchiMate parse tree.');
  return item;
}

function boundsOf(ctx: Context): TokenBounds {
  let first: IToken | undefined;
  let last: IToken | undefined;
  const visit = (children: Context): void => {
    for (const items of Object.values(children)) {
      for (const item of items) {
        if ('children' in item) {
          visit(item.children);
          continue;
        }
        if (!first || item.startOffset < first.startOffset) first = item;
        if (!last || item.startOffset > last.startOffset) last = item;
      }
    }
  };
  visit(ctx);
  if (!first || !last) throw new Error('Empty ArchiMate statement.');
  return { first, last };
}

const parser = new ArchiMateParser();
const BaseVisitor = parser.getBaseCstVisitorConstructor<undefined, Declaration | Declaration[]>();

class DeclarationVisitor extends BaseVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  document(ctx: Context): Declaration[] {
    return (ctx.statement ?? []).flatMap((node) => {
      if (!('children' in node)) throw new Error('Invalid ArchiMate parse tree.');
      return this.visit(node);
    });
  }

  statement(ctx: Context): Declaration | Declaration[] {
    const child = Object.values(ctx)[0]?.[0];
    if (!child || !('children' in child)) throw new Error('Incomplete ArchiMate statement.');
    return this.visit(child);
  }

  directionStatement(ctx: Context): Declaration {
    return { kind: 'direction', value: requiredToken(ctx, 'value') };
  }

  layoutStatement(ctx: Context): Declaration {
    return { kind: 'layout', value: requiredToken(ctx, 'value') };
  }

  // A block nests every element declared directly inside it in the enclosing element.
  elementStatement(ctx: Context): Declaration[] {
    const parent = requiredToken(ctx, 'id');
    const declared: Declaration = {
      kind: 'element',
      bounds: boundsOf(ctx),
      type: requiredToken(ctx, 'type'),
      id: parent,
      name: requiredToken(ctx, 'name'),
    };
    const body = (ctx.blockStatement ?? []).map((node) => {
      if (!('children' in node)) throw new Error('Invalid ArchiMate parse tree.');
      return [this.visit(node)].flat();
    });
    const nesting = body.flatMap(([first]): Declaration[] =>
      first?.kind === 'element' ? [{ kind: 'nesting', child: first.id, parent }] : [],
    );
    return [declared, ...nesting, ...body.flat()];
  }

  blockStatement(ctx: Context): Declaration | Declaration[] {
    return this.statement(ctx);
  }

  clickStatement(ctx: Context): Declaration {
    return {
      kind: 'click',
      bounds: boundsOf(ctx),
      id: requiredToken(ctx, 'id'),
      url: requiredToken(ctx, 'url'),
      ...(ctx.tooltip && { tooltip: requiredToken(ctx, 'tooltip') }),
      ...(ctx.target && { target: requiredToken(ctx, 'target') }),
    };
  }

  descriptionStatement(ctx: Context): Declaration {
    return {
      kind: 'description',
      bounds: boundsOf(ctx),
      id: requiredToken(ctx, 'id'),
      value: requiredToken(ctx, 'value'),
    };
  }

  relationshipStatement(ctx: Context): Declaration {
    return {
      kind: 'relationship',
      bounds: boundsOf(ctx),
      type: requiredToken(ctx, 'type'),
      id: requiredToken(ctx, 'id'),
      source: requiredToken(ctx, 'source'),
      target: requiredToken(ctx, 'target'),
      ...(ctx.mode && { accessKeyword: requiredToken(ctx, 'Access'), mode: requiredToken(ctx, 'mode') }),
      ...(ctx.Directed && { directed: requiredToken(ctx, 'Directed') }),
      ...(ctx.labelText && { labelMarker: requiredToken(ctx, 'Label'), label: requiredToken(ctx, 'labelText') }),
    };
  }

  connectorStatement(ctx: Context): Declaration {
    return {
      kind: 'connector',
      bounds: boundsOf(ctx),
      source: requiredToken(ctx, 'source'),
      connector: requiredToken(ctx, 'connector'),
      target: requiredToken(ctx, 'target'),
      ...(ctx.labelText && { labelMarker: requiredToken(ctx, 'Colon'), label: requiredToken(ctx, 'labelText') }),
    };
  }

  metadataStatement(ctx: Context): Declaration {
    return { kind: 'metadata', value: requiredToken(ctx, 'value') };
  }

  noteStatement(ctx: Context): Declaration {
    return {
      kind: 'note',
      bounds: boundsOf(ctx),
      id: requiredToken(ctx, 'id'),
      text: requiredToken(ctx, 'text'),
      ...(ctx.anchor && { on: requiredToken(ctx, 'On'), anchor: requiredToken(ctx, 'anchor') }),
    };
  }

  positionsStatement(ctx: Context): Declaration {
    const entries = (ctx.positionEntry ?? []).map((node) => {
      if (!('children' in node)) throw new Error('Invalid ArchiMate parse tree.');
      return this.positionEntry(node.children);
    });
    return { kind: 'positions', bounds: boundsOf(ctx), keyword: requiredToken(ctx, 'Positions'), entries };
  }

  positionEntry(ctx: Context): PositionEntry {
    const subject = requiredToken(ctx, 'subject');
    if (ctx.x) {
      return {
        kind: 'elementPosition',
        bounds: boundsOf(ctx),
        id: subject,
        x: requiredToken(ctx, 'x'),
        y: requiredToken(ctx, 'y'),
        ...(ctx.size && { sizeKeyword: requiredToken(ctx, 'Size'), size: requiredToken(ctx, 'size') }),
      };
    }
    const sides = ctx.anchorSides?.[0];
    if (!sides || !('children' in sides)) throw new Error('Incomplete ArchiMate anchor.');
    return {
      kind: 'anchor',
      bounds: boundsOf(ctx),
      subject,
      ...(ctx.connector && { connector: requiredToken(ctx, 'connector'), target: requiredToken(ctx, 'target') }),
      ...this.anchorSides(sides.children),
    };
  }

  anchorSides(ctx: Context): Pick<AnchorEntry, 'fromKeyword' | 'sourceSide' | 'toKeyword' | 'targetSide'> {
    return {
      ...(ctx.sourceSide && { fromKeyword: requiredToken(ctx, 'From'), sourceSide: requiredToken(ctx, 'sourceSide') }),
      ...(ctx.targetSide && { toKeyword: requiredToken(ctx, 'To'), targetSide: requiredToken(ctx, 'targetSide') }),
    };
  }

  nestingStatement(ctx: Context): Declaration {
    return {
      kind: 'nesting',
      child: requiredToken(ctx, 'child'),
      parent: requiredToken(ctx, 'parent'),
      ...(ctx.relationshipId && { relationshipId: requiredToken(ctx, 'relationshipId') }),
    };
  }
}

const visitor = new DeclarationVisitor();

export type GrammarResult = { readonly declarations: Declaration[] } | { readonly syntaxError: IRecognitionException };

export function parseDeclarations(input: IToken[]): GrammarResult {
  parser.input = input;
  const tree = parser.document();
  const syntaxError = parser.errors[0];
  if (syntaxError) return { syntaxError };
  const declarations = visitor.visit(tree);
  if (!Array.isArray(declarations)) throw new Error('Invalid ArchiMate document parse tree.');
  return { declarations };
}

const relationshipOptionOrder: readonly TokenType[] = [access, directed, label];

// Chevrotain reports a misplaced relationship option as unexpected trailing input; name the ordering rule instead.
export function describeSyntaxError(error: IRecognitionException, tokens: readonly IToken[]): string {
  const rank = relationshipOptionOrder.indexOf(error.token.tokenType);
  const index = tokens.indexOf(error.token);
  if (rank < 0 || index < 0) return error.message;
  let statementStart = index;
  while (statementStart > 0 && tokens[statementStart - 1]?.tokenType !== newline) statementStart--;
  const statement = tokens.slice(statementStart, index);
  if (statement[0]?.tokenType !== relationship) return error.message;
  const later = statement.find((token) => relationshipOptionOrder.indexOf(token.tokenType) > rank);
  return later ? '"' + error.token.image + '" must come before "' + later.image + '".' : error.message;
}
