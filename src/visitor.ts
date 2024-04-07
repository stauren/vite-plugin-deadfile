import type {
  CallExpression,
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
  private viteDynamicImports: Set<string> = new Set();
  public init() {
    this.viteDynamicImports = new Set();
  }
  public visitTsType(n: TsType) {
    return n;
  }
  public visitCallExpression(n: CallExpression): Expression {
    let isHelper = false;
    if (n.callee.type === 'Identifier') {
      if (n.callee.value === '__variableDynamicImportRuntimeHelper') {
        // __variableDynamicImportRuntimeHelper((/* #__PURE__ */ Object.assign({"./path/to/file.tsx": () => import("./path/to/file.tsx"),})), `./path/to/${moduleName}.tsx`);
        isHelper = true;
        this.collectViteDynamicImport = true;
      }
    } else if (n.callee.type === 'Import' && this.collectViteDynamicImport) {
      const { expression } = n.arguments[0];
      if (expression.type === 'StringLiteral') {
        this.viteDynamicImports.add(expression.value);
      }
    }
    const result = super.visitCallExpression(n);

    if (isHelper) {
      this.collectViteDynamicImport = false;
    }
    return result;
  }
  public getViteDynamicImports() {
    return [...this.viteDynamicImports];
  }
}
