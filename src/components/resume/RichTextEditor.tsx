import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { DOMParser as ProseMirrorParser } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading3,
  RemoveFormatting,
} from 'lucide-react'
import { clipboardHtml } from '../../lib/clipboard-html'
import { safeHtml } from '../../lib/html-to-markdown'
import { markdownItems } from '../../domain/rich-text'

export function RichTextEditor({
  label,
  value,
  onChange,
  maxLength = 20000,
  maxItems,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  maxItems?: number
  disabled?: boolean
}) {
  const current = useRef({ onChange, maxLength, maxItems, value })
  current.current = { onChange, maxLength, maxItems, value }
  const [, setRevision] = useState(0)
  const [error, setError] = useState('')
  const plainPaste = useRef(false)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: false },
      }),
      Markdown,
    ],
    content: value,
    contentType: 'markdown',
    editable: !disabled,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
        class: 'rich-editor-content resume-richtext',
      },
      // ProseMirror parses a default slice before invoking handlePaste.
      transformPastedHTML: safeHtml,
      handleKeyDown: (_view, event) => {
        plainPaste.current = event.shiftKey
        return false
      },
      handleDOMEvents: {
        keyup: (_view, event) => {
          plainPaste.current = event.shiftKey
          return false
        },
        blur: () => {
          plainPaste.current = false
          return false
        },
      },
      handlePaste: (view, event) => {
        if (plainPaste.current) return false
        const data = event.clipboardData
        if (!data) return false
        const text = data.getData('text/plain')
        const html = data.getData('text/html')
        if (!html && !text) return false
        // Let ProseMirror fit the semantic slice into the current selection and
        // keep its native paste transaction / undo behavior.
        const container = view.dom.ownerDocument.createElement('div')
        container.innerHTML = clipboardHtml(html, text)
        const slice = ProseMirrorParser.fromSchema(
          view.state.schema,
        ).parseSlice(container, { context: view.state.selection.$from })
        if (!slice.content.size) return true
        view.dispatch(
          closeHistory(view.state.tr)
            .replaceSelection(slice)
            .scrollIntoView()
            .setMeta('paste', true)
            .setMeta('uiEvent', 'paste'),
        )
        return true
      },
    },
    onSelectionUpdate: () => setRevision((n) => n + 1),
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown()
      if (markdown.length > current.current.maxLength) {
        setError(
          `内容过长，请控制在 ${current.current.maxLength.toLocaleString()} 字符内。`,
        )
        editor.commands.setContent(current.current.value, {
          contentType: 'markdown',
          emitUpdate: false,
        })
        return
      }
      if (
        current.current.maxItems &&
        markdownItems(markdown).length > current.current.maxItems
      ) {
        setError(`最多保留 ${current.current.maxItems} 条，请合并相关内容。`)
        editor.commands.setContent(current.current.value, {
          contentType: 'markdown',
          emitUpdate: false,
        })
        return
      }
      setError('')
      current.current.onChange(markdown)
      setRevision((n) => n + 1)
    },
  })
  useEffect(() => {
    if (editor && editor.getMarkdown() !== value)
      editor.commands.setContent(value, {
        contentType: 'markdown',
        emitUpdate: false,
      })
  }, [editor, value])
  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])
  const tools = editor
    ? [
        {
          name: '加粗',
          icon: Bold,
          active: editor.isActive('bold'),
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          name: '斜体',
          icon: Italic,
          active: editor.isActive('italic'),
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          name: '小标题',
          icon: Heading3,
          active: editor.isActive('heading'),
          run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        },
        {
          name: '项目列表',
          icon: List,
          active: editor.isActive('bulletList'),
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          name: '编号列表',
          icon: ListOrdered,
          active: editor.isActive('orderedList'),
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          name: '清除格式',
          icon: RemoveFormatting,
          active: false,
          run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
        },
      ]
    : []
  return (
    <div className="rich-editor-field">
      <span className="rich-editor-label">{label}</span>
      <div className="rich-editor">
        <div
          role="toolbar"
          aria-label={`${label}格式`}
          className="rich-editor-toolbar"
        >
          {tools.map(({ name, icon: Icon, active, run }) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              title={name}
              aria-pressed={active}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={run}
            >
              <Icon size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  )
}
