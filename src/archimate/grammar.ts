import { CstParser, EOF, defaultParserErrorProvider } from 'chevrotain';
import type { CstNode, IParserErrorMessageProvider, IRecognitionException, IToken, TokenType } from 'chevrotain';
import {
  access,
  accDescrBlock,
  arrow,
  click,
  closeBrace,
  colon,
  connector,
  description,
  directed,
  direction,
  element,
  header,
  href,
  identifier,
  inside,
  label,
  layout,
  metadata,
  nest,
  newline,
  note,
  on,
  openBrace,
  quoted,
  relationship,
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
        'Expected a new line or an ArchiMate declaration (layout, direction, element, description, relationship, connector, note, nest, click, or metadata).',
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
  | { kind: 'element'; type: IToken; id: IToken; name: IToken }
  | { kind: 'description'; id: IToken; value: IToken }
  | { kind: 'note'; id: IToken; text: IToken; anchor?: IToken }
  | { kind: 'nesting'; child: IToken; parent: IToken; relationshipId?: IToken }
  | { kind: 'click'; id: IToken; url: IToken; tooltip?: IToken; target?: IToken }
  | RelationshipDeclaration
  | ConnectorDeclaration;

export interface RelationshipDeclaration {
  kind: 'relationship';
  type: IToken;
  id: IToken;
  source: IToken;
  target: IToken;
  mode?: IToken;
  directed?: IToken;
  label?: IToken;
}

export interface ConnectorDeclaration {
  kind: 'connector';
  source: IToken;
  connector: IToken;
  target: IToken;
  label?: IToken;
}

function requiredToken(ctx: Context, name: string): IToken {
  const item = ctx[name]?.[0];
  if (!item || !('tokenType' in item)) throw new Error('Incomplete ArchiMate parse tree.');
  return item;
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
      id: requiredToken(ctx, 'id'),
      url: requiredToken(ctx, 'url'),
      ...(ctx.tooltip && { tooltip: requiredToken(ctx, 'tooltip') }),
      ...(ctx.target && { target: requiredToken(ctx, 'target') }),
    };
  }

  descriptionStatement(ctx: Context): Declaration {
    return { kind: 'description', id: requiredToken(ctx, 'id'), value: requiredToken(ctx, 'value') };
  }

  relationshipStatement(ctx: Context): Declaration {
    return {
      kind: 'relationship',
      type: requiredToken(ctx, 'type'),
      id: requiredToken(ctx, 'id'),
      source: requiredToken(ctx, 'source'),
      target: requiredToken(ctx, 'target'),
      ...(ctx.mode && { mode: requiredToken(ctx, 'mode') }),
      ...(ctx.Directed && { directed: requiredToken(ctx, 'Directed') }),
      ...(ctx.labelText && { label: requiredToken(ctx, 'labelText') }),
    };
  }

  connectorStatement(ctx: Context): Declaration {
    return {
      kind: 'connector',
      source: requiredToken(ctx, 'source'),
      connector: requiredToken(ctx, 'connector'),
      target: requiredToken(ctx, 'target'),
      ...(ctx.labelText && { label: requiredToken(ctx, 'labelText') }),
    };
  }

  metadataStatement(ctx: Context): Declaration {
    return { kind: 'metadata', value: requiredToken(ctx, 'value') };
  }

  noteStatement(ctx: Context): Declaration {
    return {
      kind: 'note',
      id: requiredToken(ctx, 'id'),
      text: requiredToken(ctx, 'text'),
      ...(ctx.anchor && { anchor: requiredToken(ctx, 'anchor') }),
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
