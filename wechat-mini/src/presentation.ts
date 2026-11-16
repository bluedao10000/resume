import { fromMarkdown } from 'mdast-util-from-markdown'
import type { RootContent } from 'mdast'
import type { Resume } from '../../src/domain/resume'
import { sectionOrder, sectionNames } from '../../src/domain/resume-layout'
import { presentationFor } from '../../src/domain/resume-presentation'

export type NativeNode =
  | { type: 'text'; text: string }
  | {
      type: 'node'
      name: string
      attrs: { style: string }
      children: NativeNode[]
    }
// Match the web semantic whitelist. Never pass source HTML, URLs or media to wx.
export function nativeMarkdown(value: string): NativeNode[] {
  function nodes(node: RootContent): NativeNode[] {
    if (
      node.type === 'html' ||
      node.type === 'image' ||
      node.type === 'imageReference'
    )
      return []
    if (node.type === 'text') return [{ type: 'text', text: node.value }]
    if (node.type === 'inlineCode' || node.type === 'code')
      return [
        {
          type: 'node',
          name: 'code',
          attrs: { style: 'font-family:monospace' },
          children: [{ type: 'text', text: node.value }],
        },
      ]
    const children =
      'children' in node
        ? node.children.flatMap((child) => nodes(child as RootContent))
        : []
    const tags: Record<string, [string, string]> = {
      paragraph: ['p', 'margin:0;line-height:inherit'],
      strong: ['strong', 'font-weight:650'],
      emphasis: ['em', 'font-style:italic'],
      heading: [
        'h3',
        'font-size:1.08em;line-height:1.7;font-weight:650;margin:8px 0 4px',
      ],
      list: [
        node.type === 'list' && node.ordered ? 'ol' : 'ul',
        'margin:4px 0;padding-left:16px',
      ],
      listItem: ['li', 'margin:2px 0'],
      break: ['br', ''],
      link: ['span', 'text-decoration:underline'],
    }
    const tag = tags[node.type]
    return tag
      ? [{ type: 'node', name: tag[0], attrs: { style: tag[1] }, children }]
      : children
  }
  return fromMarkdown(value).children.flatMap(nodes)
}
export function documentView(selected: Resume) {
  return {
    id: selected.id,
    selected,
    presentation: presentationFor(selected),
    sections: sectionOrder(selected).map((id) => ({
      id,
      name: sectionNames[id],
      text:
        id === 'summary'
          ? selected.summary
          : id === 'education'
            ? selected.education
            : '',
      nodes: nativeMarkdown(
        id === 'summary'
          ? selected.summary
          : id === 'education'
            ? selected.education
            : '',
      ),
      entries:
        id === 'experience'
          ? selected.experience.map((e) => ({
              ...e,
              bullets: e.bullets.map(nativeMarkdown),
            }))
          : [],
      skills: id === 'skills' ? selected.skills.map(nativeMarkdown) : [],
    })),
  }
}
