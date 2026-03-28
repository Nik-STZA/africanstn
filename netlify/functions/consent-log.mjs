import { getStore } from '@netlify/blobs'

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { action } = body
  if (!action || !['accept_all', 'essentials_only'].includes(action)) {
    return new Response('Invalid action', { status: 400 })
  }

  const store = getStore('consent-audit-log')
  const timestamp = new Date().toISOString()
  const key = `${timestamp}-${context.requestId}`

  await store.setJSON(key, {
    action,
    timestamp,
    ip: context.ip,
    country: context.geo?.country?.code || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  })

  return Response.json({ ok: true })
}

export const config = {
  path: '/api/consent-log',
  method: 'POST',
}
