import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/proxy.mjs'

function response() {
  return { statusCode: 200, headers: {}, setHeader(k,v) {this.headers[k]=v},
    status(n) {this.statusCode=n;return this}, json(v) {this.body=v;return this},
    end(v) {this.body=v;return this} }
}

test('proxy injects server token, preserves filters and binary image data', async () => {
  process.env.TERRATWINN_API_URL='http://backend.test:8001'
  process.env.TERRATWINN_API_TOKEN='test-token'
  const original=global.fetch
  global.fetch=async (url, options) => {
    assert.equal(url.href, 'http://backend.test:8001/api/analogs/regions?run=mars_judge')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return new Response(new Uint8Array([137,80,78,71]), {headers:{'content-type':'image/png'}})
  }
  try {
    const res=response()
    await handler({method:'GET',url:'/api/proxy?path=analogs/regions&run=mars_judge',query:{path:'analogs/regions'}},res)
    assert.equal(res.statusCode,200)
    assert.equal(res.headers['content-type'],'image/png')
    assert.deepEqual([...res.body],[137,80,78,71])
    assert.equal(res.headers['Cache-Control'],'no-store')
  } finally {global.fetch=original}
})

test('write methods and traversal cannot use privileged proxy', async () => {
  for(const [method,path,expected] of [['POST','analogs/runs',405],['GET','analogs/../../docs',404],['GET','rate/next',404]]) {
    const res=response()
    await handler({method,url:'/api/proxy',query:{path}},res)
    assert.equal(res.statusCode,expected)
  }
})

test('missing token fails closed without contacting backend', async () => {
  delete process.env.TERRATWINN_API_TOKEN
  const res=response()
  await handler({method:'GET',url:'/api/proxy',query:{path:'analogs/runs'}},res)
  assert.equal(res.statusCode,503)
})
