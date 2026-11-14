import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import { toString } from 'mdast-util-to-string'
import type { ListItem } from 'mdast'

export function plainText(value: string) {
  return toString(fromMarkdown(value))
}

export function listMarkdown(items: string[]) {
  if (!items.length) return ''
  return toMarkdown(
    {
      type: 'root',
      children: [
        {
          type: 'list',
          ordered: false,
          spread: false,
          children: items.map((value) => ({
            type: 'listItem',
            spread: false,
            children: fromMarkdown(value).children as ListItem['children'],
          })),
        },
      ],
    },
    { bullet: '-' },
  ).trim()
}

// Keep each top-level item as one existing schema entry, including nested lists.
export function markdownItems(value: string): string[] {
  return fromMarkdown(value)
    .children.flatMap((node) =>
      node.type === 'list'
        ? node.children.map((item) =>
            toMarkdown(
              { type: 'root', children: item.children },
              { bullet: '-' },
            ).trim(),
          )
        : [
            toMarkdown(
              { type: 'root', children: [node] },
              { bullet: '-' },
            ).trim(),
          ],
    )
    .filter(Boolean)
}
