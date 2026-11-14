import Markdown from 'react-markdown'

// Render semantic nodes only. Raw HTML, images, embedded media and unsafe URLs
// are never inserted into the resume DOM, regardless of their source.
export function RichText({
  value,
  className = '',
}: {
  value: string
  className?: string
}) {
  return (
    <div className={`resume-richtext ${className}`}>
      <Markdown
        skipHtml
        allowedElements={[
          'p',
          'strong',
          'em',
          'ul',
          'ol',
          'li',
          'br',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'a',
          'code',
        ]}
        unwrapDisallowed
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h3>{children}</h3>,
          h5: ({ children }) => <h3>{children}</h3>,
          h6: ({ children }) => <h3>{children}</h3>,
          a: ({ href, children }) =>
            href ? (
              <a href={href} rel="noreferrer noopener" target="_blank">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {value}
      </Markdown>
    </div>
  )
}
