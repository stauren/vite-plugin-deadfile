import type {
  ArrowFunctionExpression,
  Expression,
  ImportDeclaration,
  TsType,
} from '@swc/core';
import { Visitor } from '@swc/core/Visitor';

export class ImportVisitor extends Visitor {
  private imports: string[] = [];
  public init() {
    this.imports = [];
  }
  public visitTsType(n: TsType) {
    return n;
  }
  public visitImportDeclaration(n: ImportDeclaration) {
    const result = super.visitImportDeclaration(n);
    this.imports.push(result.source.value);
    return result;
  }
  public getImports() {
    return this.imports;
  }
}

export class DynamicImportVisitor extends Visitor {
  private collectViteDynamicImport = false;
  private viteDynamicImports: string[] = [];
  public init() {
    this.viteDynamicImports = [];
  }
  public visitTsType(n: TsType) {
    return n;
  }
  public visitArrowFunctionExpression(n: ArrowFunctionExpression): Expression {
    let isHelper = false;
    const bd = n.body;
    if (bd.type === 'CallExpression') {
      if (bd.callee.type === 'Identifier') {
        // () => __variableDynamicImportRuntimeHelper((/* #__PURE__ */ Object.assign({"./path/to/file.tsx": () => import("./path/to/file.tsx"),})), `./path/to/${moduleName}.tsx`);
        if (bd.callee.value === '__variableDynamicImportRuntimeHelper') {
          isHelper = true;
          this.collectViteDynamicImport = true;
        }
      } else if (bd.callee.type === 'Import' && this.collectViteDynamicImport) {
        const { expression } = bd.arguments[0];
        if (expression.type === 'StringLiteral') {
          this.viteDynamicImports.push(expression.value);
        }
      }
    }
    const result = super.visitArrowFunctionExpression(n);

    if (isHelper) {
      this.collectViteDynamicImport = false;
    }
    return result;
  }
  public getViteDynamicImports() {
    return this.viteDynamicImports;
  }
}
