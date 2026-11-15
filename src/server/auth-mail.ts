export async function sendLoginCode({
  apiKey,
  from,
  email,
  otp,
}: {
  apiKey: string
  from: string
  email: string
  otp: string
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Folio 登录验证码',
      text: `你的 Folio 登录验证码\n\n${otp}\n\n验证码 5 分钟内有效。如果你没有尝试登录，可以忽略此邮件。`,
    }),
  })
  if (!response.ok) throw new Error('AUTH_MAIL_DELIVERY_FAILED')
}
