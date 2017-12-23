const test = require('tape')
const h = require('highland')
const { useFakeTimers } = require('sinon')

test('index', assert => {
  test('lib', assert => {
    const clock = useFakeTimers(1506438000000)
    const { lib } = require('./index')

    assert.equal(typeof lib, 'function', 'returns a function')
    assert.equal(lib.length, 3, 'expects 3 arguments')

    assert.ok(h.isStream(lib()), 'execution returns a stream')

    lib('patco', 'haddonfield', 'ashland')
      .tap(x => assert.equal(x.trip_headsign, 'Lindenwold', 'correct trip directions'))
      .collect()
      .tap(xs => assert.ok(xs.length, 'some results'))
      .tap(xs => assert.deepEqual(xs, [
        { trip_headsign: 'Lindenwold', origin_departure_time: '11:05:00', destination_arrival_time: '11:10:00' },
        { trip_headsign: 'Lindenwold', origin_departure_time: '11:17:00', destination_arrival_time: '11:22:00' },
        { trip_headsign: 'Lindenwold', origin_departure_time: '11:29:00', destination_arrival_time: '11:34:00' },
        { trip_headsign: 'Lindenwold', origin_departure_time: '11:41:00', destination_arrival_time: '11:46:00' },
        { trip_headsign: 'Lindenwold', origin_departure_time: '11:53:00', destination_arrival_time: '11:58:00' }
      ]))
      .tap(() => clock.restore())
      .errors(err => assert.ifError(err))
      .done(assert.end)
  })

  test('getThings', assert => {
    const { getThings } = require('./index')

    getThings('https://transit.land/api/v1/operators?per_page=1')
      .take(2)
      .collect()
      .tap(xs => assert.equal(xs.length, 2, 'calls `next` link for more'))
      .errors(assert.ifError)
      .done(assert.end)
  })

  test('findThings', assert => {
    const { findThings } = require('./index')

    findThings('operators')({ per_page: 1 })
      .take(2)
      .tap(x => assert.ok(x instanceof Array, 'array of results returned'))
      .tap(x => assert.ok(x.length, 'results array is not empty'))
      .collect()
      .tap(xs => assert.equal(xs.length, 2, 'calls `next` link for more'))
      .errors(err => assert.ifError(err))
      .done(assert.end)
  })

  test('findOperators', assert => {
    const { findOperators } = require('./index')

    findOperators({ term: 'patco' })
      .take(1)
      .tap(x => assert.equal(typeof x, 'object', 'operator is an object'))
      .tap(x => assert.equal(x.onestop_id, 'o-dr4e-portauthoritytransitcorporation', 'found patco'))
      .collect()
      .tap(xs => assert.equal(xs.length, 1, 'returns a single result'))
      .errors(err => assert.ifError(err))
      .done(assert.end)
  })

  test('findStops', assert => {
    const { findStops } = require('./index')

    findStops({
      term: 'haddonfield',
      onestop_id: 'o-dr4e-portauthoritytransitcorporation'
    })
      .take(1)
      .tap(x => assert.equal(x.onestop_id, 's-dr4durps7v-haddonfield', 'has `onestop_id`'))
      .tap(x => assert.equal(x.timezone, 'America/New_York', 'has `timezone`'))
      .tap(x => assert.equal(typeof x, 'object', 'result is an object'))
      .collect()
      .tap(xs => assert.equal(xs.length, 1, 'returns a single result'))
      .errors(assert.ifError)
      .done(assert.end)
  })

  test('findStopsForOperator', assert => {
    const { findStopsForOperator } = require('./index')

    findStopsForOperator('haddonfield', 'ashland')({
      onestop_id: 'o-dr4e-portauthoritytransitcorporation'
    })
      .take(1)
      .tap(x => assert.equal(typeof x, 'object', 'returns an object'))
      .tap(x => assert.equal(x.timezone, 'America/New_York', 'has `timezone`'))
      .tap(x => assert.equal(x.onestop_id, 'o-dr4e-portauthoritytransitcorporation', 'has `onestop_id`'))
      .tap(x => assert.equal(x.origin_onestop_id, 's-dr4durps7v-haddonfield', 'has `origin_onestop_id`'))
      .tap(x => assert.equal(x.destination_onestop_id, 's-dr4dv05cxp-ashland', 'has `destination_onestop_id`'))
      .collect()
      .tap(xs => assert.equal(xs.length, 1, 'returns origin and destination merged'))
      .errors(assert.ifError)
      .done(assert.end)
  })

  test('findScheduleStopPairs', assert => {
    const { findScheduleStopPairs } = require('./index')

    test('findScheduleStopPairs origin', assert => {
      const clock = useFakeTimers(1506438000000)

      findScheduleStopPairs({
        timezone: 'America/New_York',
        onestop_id: 'o-dr4e-portauthoritytransitcorporation',
        origin_onestop_id: 's-dr4durps7v-haddonfield'
      })
        .take(2)
        .tap(x => assert.equal(typeof x, 'object', 'result is an object'))
        .tap(x => assert.equal(x.origin_onestop_id, 's-dr4durps7v-haddonfield', 'correct stop'))
        .collect()
        .tap(xs => assert.equal(xs.length, 2, 'returns a single result'))
        .tap(() => clock.restore())
        .errors(assert.ifError)
        .done(assert.end)
    })

    test('findScheduleStopPairs origin pre-midnight', assert => {
      const clock = useFakeTimers(1506484740000)

      findScheduleStopPairs({
        timezone: 'America/New_York',
        onestop_id: 'o-dr4e-portauthoritytransitcorporation',
        origin_onestop_id: 's-dr4durps7v-haddonfield'
      })
        .take(2)
        .tap(x => assert.equal(typeof x, 'object', 'result is an object'))
        .tap(x => assert.equal(x.origin_onestop_id, 's-dr4durps7v-haddonfield', 'correct stop'))
        .tap(x => assert.ok(/^00:/.test(x.origin_departure_time), 'tomorrow train'))
        .collect()
        .tap(xs => assert.equal(xs.length, 2, 'returns a single result'))
        .tap(() => clock.restore())
        .errors(assert.ifError)
        .done(assert.end)
    })

    test('findScheduleStopPairs origin', assert => {
      const clock = useFakeTimers(1506438000000)

      findScheduleStopPairs({
        timezone: 'America/New_York',
        onestop_id: 'o-dr4e-portauthoritytransitcorporation',
        destination_onestop_id: 's-dr4dv05cxp-ashland'
      })
        .take(2)
        .tap(x => assert.equal(typeof x, 'object', 'result is an object'))
        .tap(x => assert.equal(x.destination_onestop_id, 's-dr4dv05cxp-ashland', 'correct stop'))
        .collect()
        .tap(xs => assert.equal(xs.length, 2, 'returns a single result'))
        .tap(() => clock.restore())
        .errors(assert.ifError)
        .done(assert.end)
    })

    test('findScheduleStopPairs destination pre-midnight', assert => {
      const clock = useFakeTimers(1506484740000)

      findScheduleStopPairs({
        timezone: 'America/New_York',
        onestop_id: 'o-dr4e-portauthoritytransitcorporation',
        destination_onestop_id: 's-dr4dv05cxp-ashland'
      })
        .take(2)
        .tap(x => assert.equal(typeof x, 'object', 'result is an object'))
        .tap(x => assert.equal(x.destination_onestop_id, 's-dr4dv05cxp-ashland', 'correct stop'))
        .tap(x => assert.ok(/^00:/.test(x.origin_departure_time), 'tomorrow train'))
        .tap(x => assert.ok(x.trip, 'has `trip`'))
        .collect()
        .tap(xs => assert.equal(xs.length, 2, 'returns a single result'))
        .tap(() => clock.restore())
        .errors(assert.ifError)
        .done(assert.end)
    })

    assert.end()
  })

  test('findScheduleStopPairsForStops', assert => {
    const { findScheduleStopPairsForStops } = require('./index')

    test('findScheduleStopPairsForStops origin', assert => {
      const clock = useFakeTimers(1506438000000)

      findScheduleStopPairsForStops({
        timezone: 'America/New_York',
        onestop_id: 'o-dr4e-portauthoritytransitcorporation',
        origin_onestop_id: 's-dr4durps7v-haddonfield',
        destination_onestop_id: 's-dr4dv05cxp-ashland'
      })
        .take(1)
        .tap(x => assert.equal(typeof x, 'object', 'result is an object'))
        .tap(x => assert.ok(x.trip_headsign, 'has `headsign`'))
        .tap(x => assert.ok(x.origin_departure_time, 'has `origin_departure_time`'))
        .tap(x => assert.ok(x.destination_arrival_time, 'has `destination_arrival_time`'))
        .tap(x => assert.equal(x.trip_headsign, 'Lindenwold', 'correct trip directions'))
        .collect()
        .tap(xs => assert.equal(xs.length, 1, 'returns a single result'))
        .tap(() => clock.restore())
        .errors(assert.ifError)
        .done(assert.end)
    })

    test('findScheduleStopPairsForStops destination', assert => {
      const clock = useFakeTimers(1506438000000)

      findScheduleStopPairsForStops({
        timezone: 'America/New_York',
        onestop_id: 'o-dr4e-portauthoritytransitcorporation',
        origin_onestop_id: 's-dr4durps7v-haddonfield',
        destination_onestop_id: 's-dr4dv05cxp-ashland'
      })
        .take(1)
        .tap(x => assert.equal(typeof x, 'object', 'result is an object'))
        .tap(x => assert.ok(x.trip_headsign, 'has `headsign`'))
        .tap(x => assert.ok(x.origin_departure_time, 'has `origin_departure_time`'))
        .tap(x => assert.ok(x.destination_arrival_time, 'has `destination_arrival_time`'))
        .tap(x => assert.equal(x.trip_headsign, 'Lindenwold', 'correct trip directions'))
        .collect()
        .tap(xs => assert.equal(xs.length, 1, 'returns a single object'))
        .tap(() => clock.restore())
        .errors(assert.ifError)
        .done(assert.end)
    })

    assert.end()
  })

  assert.end()
})
