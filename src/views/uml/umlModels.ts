import type { VirtualResourceType } from '../../models/treeItems';

export type UmlNodeKind = 'class' | 'interface' | 'trigger' | 'lwc';

export type RelationshipKind =
  | 'extends_abstract'
  | 'extends_concrete'
  | 'implements'
  | 'dependency'
  | 'reference';

export interface UmlNodeData {
  id: string;
  label: string;
  filePath: string;
  sourceType: VirtualResourceType;
  kind: UmlNodeKind;
  isAbstract: boolean;
  extendsName?: string;
  implementsNames?: string[];
  /** System interfaces detected (e.g. Database.Batchable, Schedulable) */
  systemInterfaces?: string[];
  /** Full modifier string (e.g. "public abstract with sharing") */
  classModifiers?: string;
  properties: UmlProperty[];
  methods: UmlMethod[];
  apexReferences?: string[];
  lwcReferences?: string[];
}

export interface UmlProperty {
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'protected' | 'global';
  modifierString?: string;
}

export interface UmlMethod {
  name: string;
  returnType: string;
  parameters: string[];
  visibility: 'public' | 'private' | 'protected' | 'global';
  /** Extra modifiers (static, override, abstract, virtual) */
  modifierString?: string;
}

export interface UmlRelationship {
  sourceId: string;
  targetId: string;
  kind: RelationshipKind;
}

export interface UmlLayoutState {
  version: number;
  selectedFiles: string[];
  nodes: Record<string, { x: number; y: number }>;
  zoom: number;
  viewOptions?: {
    showModifiers: boolean;
    showMethods: boolean;
    showProperties: boolean;
    version: number;
  };
}

export interface UmlResourceItem {
  id: string;
  label: string;
  filePath: string;
  kind: UmlNodeKind;
  sourceType: VirtualResourceType;
}
