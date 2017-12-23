const { EventEmitter } = require('events')
const querystring = require('querystring')
const F = require('fuse.js')
const h = require('highland')
const q = require('request')

const assign = (...args) => Object.assign({}, ...args)
const concat = x => y => [].concat(x).concat(y)

const ap = xs => fns => xs
  .map(x => fns.fork().map(fn => fn(x)))
  .merge()

const makeURI = type => params =>
  h.of(`https://transit.land/api/v1/${type}?${querystring.stringify(assign({
    offset: 0,
    per_page: 50,
    sort_key: 'id',
    sort_order: 'asc'
  }, params))}`)

const limiter = (n, ms) => action => {
  const doEvents = new EventEmitter()

  h('evt', doEvents)
    .ratelimit(n, ms)
    .map(([data, push]) => ([action(data), push]))
    .each(([data, push]) => {
      push(null, data)
      push(null, h.nil)
    })

  return data => h(push => doEvents.emit('evt', [data, push]))
}

const getJSON = url => h(push => q(url, (err, res, body) => {
  err = err || (res.statusCode !== 200) ? new Error(body) : null
  push(err, body)
  push(null, h.nil)
})).map(JSON.parse)

// pair the origin properties up with the destination
const pairWithDestination = origin => h.pipeline(
  h.flatMap(destination => ([ origin, destination ])),
  h.pick([ 'trip_headsign', 'origin_departure_time', 'destination_arrival_time' ]),
  h.take(2),
  h.collect(),
  h.filter(xs => xs.length === 2),
  h.map(([{ trip_headsign, origin_departure_time }, { destination_arrival_time }]) => ({
    trip_headsign,
    origin_departure_time: origin_departure_time.replace('24:', '00:'),
    destination_arrival_time: destination_arrival_time.replace('24:', '00:')
  }))
)

const fuseConfigs = {
  operators: term => list => new F(list, {
    shouldSort: true,
    threshold: 0.2,
    keys: [
      { name: 'short_name', weight: 0.7 },
      { name: 'name', weight: 0.3 }
    ]
  }).search(term),
  stops: term => list => new F(list, {
    tokenize: true,
    shouldSort: true,
    threshold: 0.3,
    keys: [
      { name: 'name', weight: 0.7 }
    ]
  }).search(term)
}

module.exports = {
  ap,
  assign,
  concat,
  getJSON,
  limiter,
  makeURI,
  pairWithDestination,
  fuseConfigs
}
