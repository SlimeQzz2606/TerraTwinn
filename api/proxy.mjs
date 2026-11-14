// Only read endpoints used by the public UI are exposed through this proxy.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ detail: 'Method not allowed' })
  }
  const base = process.env.TERRATWINN_API_URL
  const token = process.env.TERRATWINN_API_TOKEN
  if (!base || !token) {
    return res.status(503).json({ detail: 'Backend connection is not configured' })
  }
  const incoming = new URL(req.url, 'http://localhost')
  const rawPath = req.query?.path ?? incoming.searchParams.get('path')
  if (typeof rawPath !== 'string' || !/^(analogs\/[a-zA-Z0-9_./-]+|rate\/summary)$/.test(rawPath)
      || rawPath.split('/').some(part => part === '.' || part === '..')) {
    return res.status(404).json({ detail: 'Unknown API route' })
  }
  try {
    const url = new URL(base)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Invalid backend URL')
    }
    url.pathname = `/api/${rawPath}`
    url.search = incoming.search
    url.searchParams.delete('path')
    const upstream = await fetch(url, {
      method: req.method,
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(25000),
    })
    for (const name of ['content-type', 'content-disposition']) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    res.status(upstream.status)
    if (req.method === 'HEAD') return res.end()
    return res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    return res.status(502).json({ detail: 'Backend unavailable; check server URL and connectivity' })
  }
}
