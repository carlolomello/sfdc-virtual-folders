import type { VirtualResourceType } from '../../models/treeItems';

export type UmlNodeKind = 'class' | 'trigger' | 'lwc';

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
  /** Whether this class/trigger has `abstract` keyword. */
  isAbstract: boolean;
  extendsName?: string;
  implementsNames?: string[];
  properties: UmlProperty[];
  methods: UmlMethod[];
  /** Apex class names referenced via @salesforce/apex in LWC JS files */
  apexReferences?: string[];
  /** LWC component names referenced via c- tags in LWC HTML templates */
  lwcReferences?: string[];
}

export interface UmlProperty {
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'protected';
}

export interface UmlMethod {
  name: string;
  returnType: string;
  parameters: string[];
  visibility: 'public' | 'private' | 'protected';
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
}

export interface UmlResourceItem {
  id: string;
  label: string;
  filePath: string;
  kind: UmlNodeKind;
  sourceType: VirtualResourceType;
}
