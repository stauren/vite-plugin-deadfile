import { Visitor } from '@swc/core/Visitor';
import type { TsType, ImportDeclaration, Program } from '@swc/core';

export class ImportVisitor extends Visitor {
  private imports: string[] = [];
  public visitProgram(n: Program): Program {
    this.imports = [];
    const result = super.visitProgram(n);
    return result;
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
