import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guard: screens must get their words from the dictionary (t('key')), never from string literals.
 * It parses every screen with the TypeScript compiler and reports prose in JSX text, user-facing attributes and
 * message strings. A new hard-coded sentence fails here, with its file and line, instead of reaching a user who
 * chose Russian or Uzbek. Every file in src/components is scanned, plus App.tsx; there are no exclusions.
 */
const SRC = path.resolve(__dirname, '../..');
const FILES = [
  ...fs
    .readdirSync(path.join(SRC, 'components'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(SRC, 'components', f)),
  path.join(SRC, 'App.tsx'),
];

/** Words that read the same in every language. Anything else in JSX text is a leak. */
const SHARED_TOKENS = /\b(TJS|My|Finance|SOMONI|WORK|ID)\b/g;

/** Literals that are allowed on purpose, with the reason. Keep this list short. */
const ALLOWED_LITERALS: Record<string, string> = {
  // The name shown when a signed-in user has neither a display name nor an email (cannot happen with email sign-in).
  User: 'fallback display name',
  // The English fallback stored on a customized allocation; screens show describeAllocationRule(), not this text.
  'User manual adjustment (${…} TJS, auto was ${…} TJS)': 'stored English fallback, rendered via ruleText',
};

const SKIP_ATTRS = new Set(['className', 'key', 'type', 'id', 'name', 'htmlFor', 'autoComplete', 'inputMode', 'step', 'min', 'max', 'viewBox', 'fill', 'stroke', 'd', 'role', 'rel', 'target', 'href', 'style', 'value']);
const TEXT_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);

function looksLikeProse(text: string): boolean {
  return /[A-Z][a-z]{2,}/.test(text) || /[A-Za-z]{3,}.*[.!?]\s*$/.test(text) || /\b[a-z]{3,}\b.*\b[a-z]{3,}\b/.test(text) && /\s/.test(text.trim()) && !/[-:[\]/#%]/.test(text);
}

function findLeaks(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = path.relative(SRC, file);
  const leaks: string[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;

  const isTranslateArgument = (n: ts.Node) =>
    ts.isCallExpression(n.parent) && /^(t|translate)$/.test(n.parent.expression.getText());
  const isLogging = (n: ts.Node) =>
    ts.isCallExpression(n.parent) && /^console\./.test(n.parent.expression.getText());

  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n)) return;

    if (ts.isJsxText(n)) {
      const text = n.getText().replace(/\s+/g, ' ').trim();
      if (text && /[A-Za-z]{2,}/.test(text.replace(SHARED_TOKENS, ''))) leaks.push(`${rel}:${at(n)} JSX text "${text}"`);
    }

    if (ts.isJsxAttribute(n)) {
      const name = n.name.getText();
      if (SKIP_ATTRS.has(name)) return;
      if (TEXT_ATTRS.has(name) && n.initializer && ts.isStringLiteral(n.initializer)) {
        if (/[A-Za-z]{3,}/.test(n.initializer.text.replace(SHARED_TOKENS, ''))) {
          leaks.push(`${rel}:${at(n)} ${name}="${n.initializer.text}"`);
        }
      }
    }

    let literal: string | null = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literal = n.text;
    else if (ts.isTemplateExpression(n)) literal = n.head.text + n.templateSpans.map((s) => '${…}' + s.literal.text).join('');
    if (literal !== null) {
      const skip =
        isTranslateArgument(n) ||
        isLogging(n) ||
        Object.prototype.hasOwnProperty.call(ALLOWED_LITERALS, literal) ||
        (ts.isJsxAttribute(n.parent) && SKIP_ATTRS.has(n.parent.name.getText()));
      if (!skip && looksLikeProse(literal.replace(SHARED_TOKENS, ''))) leaks.push(`${rel}:${at(n)} string "${literal}"`);
      if (ts.isTemplateExpression(n)) n.templateSpans.forEach((s) => visit(s.expression));
      return;
    }

    ts.forEachChild(n, visit);
  };
  visit(sf);
  return leaks;
}

describe('screens contain no hard-coded user-facing text', () => {
  it('scans the screens it is meant to scan', () => {
    const names = FILES.map((f) => path.basename(f));
    for (const expected of ['App.tsx', 'AuthView.tsx', 'DashboardView.tsx', 'FundsView.tsx', 'IncomeView.tsx', 'ExpensesView.tsx', 'AuditLedgerView.tsx', 'AccountCard.tsx', 'Navbar.tsx']) {
      expect(names).toContain(expected);
    }
  });

  it('every sentence, label, placeholder and message comes from the dictionary', () => {
    const leaks = FILES.flatMap(findLeaks);
    expect(leaks, `Move these into the dictionary (en/ru/uz) and use t('key'):\n${leaks.join('\n')}`).toEqual([]);
  });

  it('the guard itself can see a leak (so a pass means something)', () => {
    const sample = ts.createSourceFile(
      'sample.tsx',
      `const A = () => <div title="Save changes">Hello there{'x'}<span>{setMsg('Could not save.')}</span></div>;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const found: string[] = [];
    const walk = (n: ts.Node): void => {
      if (ts.isJsxText(n) && /[A-Za-z]{2,}/.test(n.getText().trim())) found.push('text');
      if (ts.isStringLiteral(n) && looksLikeProse(n.text)) found.push('string');
      ts.forEachChild(n, walk);
    };
    walk(sample);
    expect(found).toEqual(expect.arrayContaining(['text', 'string']));
  });
});
