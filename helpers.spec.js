const test = require('tape')
const h = require('highland')

test('helpers', assert => {
  test('ap', assert => {
    const { ap } = require('./helpers')

    h.of(a => b => `${a}${b}`)
      .through(ap(h.of('a')))
      .through(ap(h.of('b')))
      .tap(x => assert.equal(x, 'ab', 'arguments applied in the correct order'))
      .collect()
      .tap(xs => assert.equals(xs.length, 1, 'single result'))
      .errors(assert.ifError)
      .done(assert.end)
  })

  test('getJSON', assert => {
    require('replayer')
    const { getJSON } = require('./helpers')

    assert.equal(typeof getJSON, 'function', 'is a function')
    assert.ok(h.isStream(getJSON('https://transit.land/api/v1/operators?per_page=1')), 'returns a stream')

    test('getJSON statusCode: 200', assert => {
      getJSON('http://transit.land/api/v1/operators?per_page=1')
        .tap(x => assert.equal(typeof x, 'object', 'object returned'))
        .tap(x => assert.ok(x.operators, 'has expected `operators` key'))
        .tap(x => assert.ok(x.meta, 'has expected `meta` key'))
        .collect()
        .tap(xs => assert.equal(xs.length, 1, 'single result'))
        .errors(assert.ifError)
        .done(assert.end)
    })

    test('getJSON statusCode: 400', assert => {
      getJSON('http://transit.land/api/v1/invalid-fixture?per_page=1')
        .errors((err, push) => push(null, err))
        .tap(err => assert.equals(err.message, '{"message":"No route matches GET /api/v1/invalid-fixture"}'))
        .collect()
        .tap(xs => assert.equal(xs.length, 1, 'single result'))
        .errors(assert.ifError)
        .done(assert.end)
    })

    assert.end()
  })

  test('limiter', assert => {
    const { limiter } = require('./helpers')

    assert.equal(typeof limiter, 'function', 'returns a function')
    assert.equal(typeof limiter(1, 10), 'function', 'returns a function')
    assert.equal(typeof limiter(1, 10)(x => x), 'function', 'returns a function')
    assert.ok(h.isStream(limiter(1, 10)(x => x)(1)), 'returns a stream')

    const now = Date.now()
    h([now, now, now, now])
      .map(limiter(1, 100)(x => x))
      .merge()
      .map(x => Math.floor((Date.now() - x) / 100) * 100)
      .reduce1((xs, x) => xs + x)
      .tap(x => assert.equal(x, 600, '~600ms of cumulative delay'))
      .errors(assert.ifError)
      .done(assert.end)
  })

  test('makeURI', assert => {
    const { makeURI } = require('./helpers')

    assert.equal(typeof makeURI, 'function', 'is a function')
    assert.equal(typeof makeURI('some-type'), 'function', 'returns a function')
    assert.ok(h.isStream(makeURI('some-type')({ foo: 'bar' })), 'returns a stream')

    makeURI('some-type')({ foo: 'bar' })
      .collect()
      .tap(xs => assert.equal(xs.length, 1, 'single result'))
      .sequence()
      .errors(assert.ifError)
      .each(x => assert.equal(x, 'https://transit.land/api/v1/some-type?offset=0&per_page=50&sort_key=id&sort_order=asc&foo=bar', 'creates expected url'))
      .done(assert.end)
  })

  test('pairWithDestination', assert => {
    const { pairWithDestination } = require('./helpers')

    assert.equal(typeof pairWithDestination, 'function', 'is a function')
    assert.ok(h.isStream(pairWithDestination({})), 'returns a stream')

    h.of({
      trip_headsign: 'Not Philadelphia',
      destination_arrival_time: '24:00:00'
    })
      .through(pairWithDestination({
        trip_headsign: 'Philadelphia',
        origin_departure_time: '23:59:00'
      }))
      .tap(x => assert.equal(x.trip_headsign, 'Philadelphia', 'origin headsign selected'))
      .tap(x => assert.equal(x.origin_departure_time, '23:59:00', 'correct departure time'))
      .tap(x => assert.equal(x.destination_arrival_time, '00:00:00', 'correct arrival time'))
      .collect()
      .tap(xs => assert.equal(xs.length, 1, 'single result'))
      .errors(assert.ifError)
      .done(assert.end)
  })

  test('fuseConfigs', assert => {
    const { ap, getJSON, fuseConfigs } = require('./helpers')

    assert.equal(typeof fuseConfigs['operators'], 'function', 'is a function')
    assert.equal(typeof fuseConfigs['stops'], 'function', 'is a function')

    test('fuseConfigs operators', assert => {
      h([
        ['operators', 'patco', x => assert.equal(x[0].short_name, 'PATCO', 'PATCO chosen')],
        ['operators', 'port authority', x => assert.equal(x[0].short_name, 'PATCO', 'PATCO chosen')],
        ['operators', 'port authority transit', x => assert.equal(x[0].short_name, 'PATCO', 'PATCO chosen')]
      ])
        .map(([type, term, assertion]) => list => () => assertion(fuseConfigs[type](term)(list)))
        .through(ap(getJSON('http://transit.land/api/v1/operators?per_page=3&offset=81')
          .map(x => x.operators)))
        .map(assertion => assertion())
        .collect()
        .tap(xs => assert.equal(xs.length, 3, 'expected results'))
        .errors(assert.ifError)
        .done(assert.end)
    })

    test('fuseConfigs stops', assert => {
      h([
        ['stops', 'haddonfeld', x => assert.equal(x[0].name, 'Haddonfield', 'Haddonfield chosen')],
        ['stops', '15 16 locust', x => assert.equal(x[0].name, '15-16th and Locust', '16th & Locust chosen')],
        ['stops', 'woodcrest', x => assert.equal(x[0].name, 'Woodcrest', 'Woodcrest chosen')]
      ])
        .map(([type, term, assertion]) => list => () => assertion(fuseConfigs[type](term)(list)))
        .through(ap(getJSON('https://transit.land/api/v1/stops?per_page=50&served_by=o-dr4e-portauthoritytransitcorporation')
          .map(x => x.stops)))
        .map(assertion => assertion())
        .collect()
        .tap(xs => assert.equal(xs.length, 3, 'expected results'))
        .errors(assert.ifError)
        .done(assert.end)
    })

    assert.end()
  })

  assert.end()
})
