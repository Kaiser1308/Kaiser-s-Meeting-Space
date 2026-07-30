import React from 'react';

export type TestNode = React.ReactElement;

export interface ResolvedNode {
  type: string | ((props: any) => React.ReactElement);
  props: Record<string, unknown>;
  children: ResolvedNode[];
}

function resolveChildren(children: unknown): ResolvedNode[] {
  const out: ResolvedNode[] = [];
  const walk = (c: unknown) => {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) {
      c.forEach(walk);
      return;
    }
    if (typeof c === 'string' || typeof c === 'number') return;
    if (React.isValidElement(c)) {
      out.push(resolve(c as React.ReactElement));
    }
  };
  walk(children);
  return out;
}

export function resolve(el: React.ReactElement): ResolvedNode {
  const props = (el.props ?? {}) as Record<string, unknown>;
  const type: ResolvedNode['type'] = el.type as ResolvedNode['type'];
  if (typeof type === 'function') {
    const rendered = type(props) as React.ReactElement;
    if (rendered && React.isValidElement(rendered)) {
      const child = resolve(rendered);
      return { type: child.type, props: { ...child.props, ...props }, children: child.children };
    }
    return { type, props, children: [] };
  }
  return { type: type as string, props, children: resolveChildren(props.children) };
}

export function render(el: React.ReactElement): ResolvedNode {
  return resolve(el);
}

export function findByType(node: ResolvedNode, type: string): ResolvedNode[] {
  const found: ResolvedNode[] = [];
  const visit = (n: ResolvedNode) => {
    if (n.type === type) found.push(n);
    n.children.forEach(visit);
  };
  visit(node);
  return found;
}

export function findByProp(node: ResolvedNode, key: string, value?: unknown): ResolvedNode[] {
  const found: ResolvedNode[] = [];
  const visit = (n: ResolvedNode) => {
    if (key in n.props && (value === undefined || n.props[key] === value)) found.push(n);
    n.children.forEach(visit);
  };
  visit(node);
  return found;
}

export function getText(node: ResolvedNode): string {
  const parts: string[] = [];
  const visit = (n: ResolvedNode) => {
    const c = n.props.children;
    if (typeof c === 'string') parts.push(c);
    else if (typeof c === 'number') parts.push(String(c));
    n.children.forEach(visit);
  };
  visit(node);
  return parts.join('');
}

export function press(node: ResolvedNode): void {
  const handler = node.props.onPress as (() => void) | undefined;
  if (typeof handler !== 'function') throw new Error('node has no onPress');
  handler();
}
