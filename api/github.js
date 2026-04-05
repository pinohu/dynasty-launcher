export const config = { runtime: 'edge' }

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const ghToken = process.env.GITHUB_TOKEN
  if (!ghToken) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Extract the GitHub API path from the request URL
  const url = new URL(request.url)
  const ghPath = url.searchParams.get('path') || ''
  const method = request.method
  
  let body = null
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.text()
  }

  const upstream = await fetch(`https://api.github.com${ghPath}`, {
    method,
    headers: {
      'Authorization': `token ${ghToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'dynasty-launcher',
    },
    ...(body ? { body } : {}),
  })

  const data = await upstream.text()

  return new Response(data, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
