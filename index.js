console.time('lambda')
const h = require('highland')
const { DateTime } = require('luxon')
const { local } = DateTime
const { ap, assign, concat, getJSON, limiter, makeURI, pairWithDestination, fuseConfigs } = require('./helpers')

const cache = () => {
  const state = {
    operators: {
      // 'patco': {
      //   onestop_id: 'o-dr4e-portauthoritytransitcorporation',
      //   timezone: 'America/New_York'
      // }
    },
    stops: {
      // 'haddonfield': {
      //   onestop_id: 's-dr4durps7v-haddonfield',
      //   trip_headsign: 'Philadelphia',
      //   operator_onestop_id: 'o-dr4e-portauthoritytransitcorporation',
      //   timezone: 'America/New_York'
      // },
      // '15 16 locust': {
      //   onestop_id: 's-dr4e382mxm-15~16thandlocust',
      //   trip_headsign: 'Philadelphia',
      //   operator_onestop_id: 'o-dr4e-portauthoritytransitcorporation',
      //   timezone: 'America/New_York'
      // }
    }
  }

  return (table, term) => state && state[table] && state[table][term]
}

const getJSONLimited = url => limiter(8, 1000)(getJSON)(url)
  .sequence()

const getThings = url => getJSONLimited(url)
  .flatMap(things => h(push => {
    push(null, h.of(things))
    if (things && things.meta && things.meta.next) push(null, getThings(things.meta.next))
    push(null, h.nil)
  }))
  .sequence()

const findThings = type => params => h.of(getThings)
  .through(ap(makeURI(type)(params)))
  .sequence()
  .pluck(type)

const findOperators = ({ term }) => h.of(cache()('operators', term))
  .compact()
  .otherwise(() => findThings('operators')({
  }).flatMap(fuseConfigs['operators'](term)))
  .take(1)

const findStops = ({ term, onestop_id }) => h.of(cache()('stops', term))
  .compact()
  .otherwise(() => findThings('stops')({
    served_by: onestop_id
  }).flatMap(fuseConfigs['stops'](term)))

const findStopsForOperator = (from, to) => operator => h([
  findStops(assign(operator, { term: from })),
  findStops(assign(operator, { term: to }))
]).parallel(2)
  .scan([], concat)
  .filter(xs => xs.length === 2)
  .map(([ origin, destination ]) => ({
    timezone: origin.timezone,
    onestop_id: operator.onestop_id,
    origin_onestop_id: origin.onestop_id,
    destination_onestop_id: destination.onestop_id
  }))

const findScheduleStopPairs = ({ onestop_id, timezone, origin_onestop_id, destination_onestop_id, origin_departure_time, trip }) => {
  const now = origin_departure_time
    ? DateTime.fromISO(origin_departure_time)
    : local().setZone(timezone)

  return h([
    findThings('schedule_stop_pairs')({
      origin_onestop_id,
      destination_onestop_id,
      sort_key: 'origin_departure_time',
      date: now.toFormat('yyyy-LL-dd'),
      origin_departure_between: origin_departure_time
        ? `${now.toFormat('T')},24:00`
        : `${now.toFormat('T')},24:00`,
      operator_onestop_id: onestop_id,
      trip
    }).sequence(),
    findThings('schedule_stop_pairs')({
      origin_onestop_id,
      destination_onestop_id,
      sort_key: 'origin_departure_time',
      date: now.plus({days: 1}).toFormat('yyyy-LL-dd'),
      origin_departure_between: '00:00,02:00',
      operator_onestop_id: onestop_id,
      trip
    }).sequence()
  ]).sequence()
}

const findScheduleStopPairsForStops = params => findScheduleStopPairs(assign(params, { destination_onestop_id: undefined }))
  .flatMap(origin => findScheduleStopPairs(assign(params, { trip: origin.trip, origin_departure_time: origin.origin_departure_time, origin_onestop_id: undefined }))
    .take(1)
    .through(pairWithDestination(origin)))

module.exports.getThings = getThings
module.exports.findThings = findThings
module.exports.findOperators = findOperators
module.exports.findStops = findStops
module.exports.findStopsForOperator = findStopsForOperator
module.exports.findScheduleStopPairs = findScheduleStopPairs
module.exports.findScheduleStopPairsForStops = findScheduleStopPairsForStops
module.exports.lib = (on, from, to) => findOperators({ term: on })
  .flatMap(findStopsForOperator)
  .flatMap(findScheduleStopPairsForStops)
  .batchWithTimeOrCount(3000, 5)
  .take(1)
  .sequence()
