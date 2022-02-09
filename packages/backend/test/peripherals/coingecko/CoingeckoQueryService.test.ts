import {
  CoingeckoClient,
  CoingeckoId,
  HttpClient,
  mock,
  UnixTime,
} from '@l2beat/common'
import { expect, mockFn } from 'earljs'

import {
  COINGECKO_HOURLY_MAX_SPAN_IN_DAYS,
  CoingeckoQueryService,
  generateRangesToCallHourly,
  getFullTimestampsList,
  pickPrices,
  PriceHistoryPoint,
} from '../../../src/peripherals/coingecko/CoingeckoQueryService'

describe(CoingeckoQueryService.name, () => {
  describe(CoingeckoQueryService.prototype.getUsdPriceHistory.name, () => {
    it('is called with correct parameters', async () => {
      const coingeckoClient = mock<CoingeckoClient>({
        getCoinMarketChartRange: mockFn().returns({
          marketCaps: [],
          totalVolumes: [],
          prices: [
            {
              date: new Date(),
              price: 1234567,
            },
          ],
        }),
      })
      const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)
      await coingeckoQueryService.getUsdPriceHistory(
        CoingeckoId('bitcoin'),
        UnixTime.fromDate(new Date('2021-01-01')).add(-5, 'minutes'),
        UnixTime.fromDate(new Date('2022-01-01')).add(5, 'minutes'),
        'daily'
      )
      expect(
        coingeckoClient.getCoinMarketChartRange
      ).toHaveBeenCalledExactlyWith([
        [
          CoingeckoId('bitcoin'),
          'usd',
          UnixTime.fromDate(new Date('2021-01-01')).add(-12, 'hours'),
          UnixTime.fromDate(new Date('2022-01-01')).add(12, 'hours'),
        ],
      ])
    })

    it('handles regular days range returned from API', async () => {
      const START = UnixTime.fromDate(new Date('2021-09-07T00:00:00Z'))

      const coingeckoClient = mock<CoingeckoClient>({
        getCoinMarketChartRange: mockFn().returns({
          prices: [
            { date: START.toDate(), price: 1200 },
            { date: START.add(1, 'days').toDate(), price: 1000 },
            { date: START.add(2, 'days').toDate(), price: 1100 },
          ],
          marketCaps: [],
          totalVolumes: [],
        }),
      })
      const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)
      const prices = await coingeckoQueryService.getUsdPriceHistory(
        CoingeckoId('bitcoin'),
        START,
        START.add(2, 'days'),
        'daily'
      )
      expect(prices).toEqual([
        { timestamp: START, value: 1200, deltaMs: 0 },
        { timestamp: START.add(1, 'days'), value: 1000, deltaMs: 0 },
        { timestamp: START.add(2, 'days'), value: 1100, deltaMs: 0 },
      ])
    })

    it('handles multiple calls to get hourly', async () => {
      const START = UnixTime.fromDate(new Date('2021-09-07T00:00:00Z'))

      const coingeckoClient = mock<CoingeckoClient>({
        getCoinMarketChartRange: mockFn()
          .returnsOnce({
            prices: [
              { date: START.toDate(), price: 1200 },
              { date: START.add(30, 'days').toDate(), price: 1000 },
              { date: START.add(60, 'days').toDate(), price: 1400 },
              { date: START.add(80, 'days').toDate(), price: 1800 },
            ],
            marketCaps: [],
            totalVolumes: [],
          })
          .returnsOnce({
            prices: [
              { date: START.add(80, 'days').toDate(), price: 1800 },
              { date: START.add(90, 'days').toDate(), price: 1700 },
              { date: START.add(120, 'days').toDate(), price: 1900 },
              { date: START.add(150, 'days').toDate(), price: 2000 },
              { date: START.add(160, 'days').toDate(), price: 2400 },
            ],
            marketCaps: [],
            totalVolumes: [],
          })
          .returnsOnce({
            prices: [
              { date: START.add(160, 'days').toDate(), price: 2400 },
              { date: START.add(180, 'days').toDate(), price: 2600 },
            ],
            marketCaps: [],
            totalVolumes: [],
          }),
      })
      const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)
      const prices = await coingeckoQueryService.getUsdPriceHistory(
        CoingeckoId('bitcoin'),
        START,
        START.add(180, 'days'),
        'hourly'
      )

      const timestamps = getFullTimestampsList(
        START,
        START.add(180, 'days'),
        'hourly'
      )
      const constPrices = [
        { date: START.toDate(), price: 1200 },
        { date: START.add(30, 'days').toDate(), price: 1000 },
        { date: START.add(60, 'days').toDate(), price: 1400 },
        { date: START.add(80, 'days').toDate(), price: 1800 },
        { date: START.add(90, 'days').toDate(), price: 1700 },
        { date: START.add(120, 'days').toDate(), price: 1900 },
        { date: START.add(150, 'days').toDate(), price: 2000 },
        { date: START.add(160, 'days').toDate(), price: 2400 },
        { date: START.add(180, 'days').toDate(), price: 2600 },
      ]

      expect(prices).toEqual(pickPrices(constPrices, timestamps))
    })

    it('handles duplicates in data returned from API', async () => {
      const START = UnixTime.fromDate(new Date('2021-09-07T00:00:00Z'))

      const coingeckoClient = mock<CoingeckoClient>({
        getCoinMarketChartRange: mockFn().returns({
          prices: [
            { date: START.toDate(), price: 1200 },
            { date: START.toDate(), price: 1200 },
            { date: START.add(1, 'days').toDate(), price: 1000 },
            { date: START.add(1, 'days').toDate(), price: 1000 },
            { date: START.add(1, 'days').toDate(), price: 1000 },
            { date: START.add(2, 'days').toDate(), price: 1100 },
            { date: START.add(2, 'days').toDate(), price: 1100 },
          ],
          marketCaps: [],
          totalVolumes: [],
        }),
      })
      const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)
      const prices = await coingeckoQueryService.getUsdPriceHistory(
        CoingeckoId('bitcoin'),
        START,
        START.add(2, 'days'),
        'daily'
      )
      expect(prices).toEqual([
        { timestamp: START, value: 1200, deltaMs: 0 },
        { timestamp: START.add(1, 'days'), value: 1000, deltaMs: 0 },
        { timestamp: START.add(2, 'days'), value: 1100, deltaMs: 0 },
      ])
    })

    it('handles irregular days range returned from API', async () => {
      const START = UnixTime.fromDate(new Date('2021-09-07T00:00:00Z'))

      const coingeckoClient = mock<CoingeckoClient>({
        getCoinMarketChartRange: mockFn().returns({
          prices: [
            { date: START.add(-2, 'hours').toDate(), price: 1200 },
            { date: START.add(1, 'days').toDate(), price: 1000 },
            {
              date: START.add(2, 'days').add(2, 'hours').toDate(),
              price: 1100,
            },
          ],
          marketCaps: [],
          totalVolumes: [],
        }),
      })
      const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)
      const prices = await coingeckoQueryService.getUsdPriceHistory(
        CoingeckoId('bitcoin'),
        START,
        START.add(2, 'days'),
        'daily'
      )
      expect(prices).toEqual([
        { timestamp: START, value: 1200, deltaMs: -2 * 60 * 60 * 1000 },
        { timestamp: START.add(1, 'days'), value: 1000, deltaMs: 0 },
        {
          timestamp: START.add(2, 'days'),
          value: 1100,
          deltaMs: 2 * 60 * 60 * 1000,
        },
      ])
    })

    it('handles unsorted days range returned from API', async () => {
      const START = UnixTime.fromDate(new Date('2021-09-07T00:00:00Z'))

      const coingeckoClient = mock<CoingeckoClient>({
        getCoinMarketChartRange: mockFn().returns({
          prices: [
            { date: START.add(1, 'days').toDate(), price: 1000 },
            { date: START.toDate(), price: 1200 },
            {
              date: START.add(2, 'days').add(2, 'hours').toDate(),
              price: 1100,
            },
          ],
          marketCaps: [],
          totalVolumes: [],
        }),
      })
      const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)
      const prices = await coingeckoQueryService.getUsdPriceHistory(
        CoingeckoId('bitcoin'),
        START,
        START.add(2, 'days'),
        'daily'
      )
      expect(prices).toEqual([
        { timestamp: START, value: 1200, deltaMs: 0 },
        { timestamp: START.add(1, 'days'), value: 1000, deltaMs: 0 },
        {
          timestamp: START.add(2, 'days'),
          value: 1100,
          deltaMs: 2 * 60 * 60 * 1000,
        },
      ])
    })
  })
})

describe(pickPrices.name, () => {
  const START = new UnixTime(1517961600)

  it('works for days', () => {
    const prices = [
      { price: 1000, date: START.toDate() },
      { price: 1100, date: START.add(1, 'days').toDate() },
      { price: 1200, date: START.add(2, 'days').toDate() },
    ]
    const timestamps = getFullTimestampsList(
      START,
      START.add(2, 'days'),
      'daily'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1000, timestamp: START, deltaMs: 0 },
      { value: 1100, timestamp: START.add(1, 'days'), deltaMs: 0 },
      { value: 1200, timestamp: START.add(2, 'days'), deltaMs: 0 },
    ])
  })

  it('works for hours', () => {
    const prices = [
      { price: 1000, date: START.toDate() },
      { price: 1100, date: START.add(1, 'hours').toDate() },
      { price: 1200, date: START.add(2, 'hours').toDate() },
    ]
    const timestamps = getFullTimestampsList(
      START,
      START.add(2, 'hours'),
      'hourly'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1000, timestamp: START, deltaMs: 0 },
      { value: 1100, timestamp: START.add(1, 'hours'), deltaMs: 0 },
      { value: 1200, timestamp: START.add(2, 'hours'), deltaMs: 0 },
    ])
  })

  it('adjusts dates for slightly off timestamps', () => {
    const prices = [
      { price: 1000, date: START.add(2, 'minutes').toDate() },
      { price: 1100, date: START.add(1, 'days').add(1, 'minutes').toDate() },
      { price: 1200, date: START.add(2, 'days').add(3, 'minutes').toDate() },
    ]
    const timestamps = getFullTimestampsList(
      START,
      START.add(2, 'days'),
      'daily'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1000, timestamp: START, deltaMs: 2 * 60 * 1000 },
      {
        value: 1100,
        timestamp: START.add(1, 'days'),
        deltaMs: 1 * 60 * 1000,
      },
      {
        value: 1200,
        timestamp: START.add(2, 'days'),
        deltaMs: 3 * 60 * 1000,
      },
    ])
  })

  it('adjusts dates before the first timestamp', () => {
    const prices = [
      { price: 1000, date: START.add(-2, 'minutes').toDate() },
      { price: 1100, date: START.add(1, 'days').toDate() },
      { price: 1200, date: START.add(2, 'days').toDate() },
    ]
    const timestamps = getFullTimestampsList(
      START,
      START.add(2, 'days'),
      'daily'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1000, timestamp: START, deltaMs: -2 * 60 * 1000 },
      {
        value: 1100,
        timestamp: START.add(1, 'days'),
        deltaMs: 0,
      },
      { value: 1200, timestamp: START.add(2, 'days'), deltaMs: 0 },
    ])
  })

  it('discards unecessary data', () => {
    const prices = [
      { price: 1100, date: START.add(-2, 'minutes').toDate() },
      { price: 1200, date: START.add(1, 'minutes').toDate() },
      { price: 1300, date: START.add(1, 'days').toDate() },
      { price: 1400, date: START.add(1, 'days').add(2, 'minutes').toDate() },
      { price: 1500, date: START.add(2, 'days').add(-1, 'minutes').toDate() },
      { price: 1600, date: START.add(2, 'days').add(2, 'minutes').toDate() },
    ]
    const timestamps = getFullTimestampsList(
      START,
      START.add(2, 'days'),
      'daily'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1200, timestamp: START, deltaMs: 1 * 60 * 1000 },
      { value: 1300, timestamp: START.add(1, 'days'), deltaMs: 0 },
      {
        value: 1500,
        timestamp: START.add(2, 'days'),
        deltaMs: -1 * 60 * 1000,
      },
    ])
  })

  it('manufactures single missing datapoint', () => {
    const prices = [
      { price: 1000, date: START.toDate() },
      { price: 1200, date: START.add(2, 'days').add(-1, 'minutes').toDate() },
    ]
    const timestamps = getFullTimestampsList(
      START,
      START.add(2, 'days'),
      'daily'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1000, timestamp: START, deltaMs: 0 },
      {
        value: 1200,
        timestamp: START.add(1, 'days'),
        deltaMs: 24 * 60 * 60 * 1000 - 60 * 1000,
      },
      { value: 1200, timestamp: START.add(2, 'days'), deltaMs: -60 * 1000 },
    ])
  })

  it('manufactures multiple missing datapoints', () => {
    const prices = [
      { price: 1000, date: START.toDate() },
      { price: 1400, date: START.add(4, 'days').toDate() },
    ]
    const timestamps = getFullTimestampsList(
      START,
      START.add(4, 'days'),
      'daily'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1000, timestamp: START, deltaMs: 0 },
      {
        value: 1000,
        timestamp: START.add(1, 'days'),
        deltaMs: -24 * 60 * 60 * 1000,
      },
      {
        value: 1400,
        timestamp: START.add(2, 'days'),
        deltaMs: 48 * 60 * 60 * 1000,
      },
      {
        value: 1400,
        timestamp: START.add(3, 'days'),
        deltaMs: 24 * 60 * 60 * 1000,
      },
      { value: 1400, timestamp: START.add(4, 'days'), deltaMs: 0 },
    ])
  })

  it('manufactures start and end datapoints', () => {
    const prices = [{ price: 1100, date: START.add(1, 'days').toDate() }]
    const timestamps = getFullTimestampsList(
      START,
      START.add(2, 'days'),
      'daily'
    )

    expect(pickPrices(prices, timestamps)).toEqual([
      { value: 1100, timestamp: START, deltaMs: 24 * 60 * 60 * 1000 },
      { value: 1100, timestamp: START.add(1, 'days'), deltaMs: 0 },
      {
        value: 1100,
        timestamp: START.add(2, 'days'),
        deltaMs: -24 * 60 * 60 * 1000,
      },
    ])
  })
})

describe(getFullTimestampsList.name, () => {
  describe('hourly', () => {
    const GRANULARITY = 'hourly'
    const FROM = UnixTime.fromDate(new Date('2021-09-07T13:00:00Z'))
    const TO = UnixTime.fromDate(new Date('2021-09-07T15:00:00Z'))

    const RESULT = [
      FROM,
      UnixTime.fromDate(new Date('2021-09-07T14:00:00Z')),
      TO,
    ]

    it('throws if FROM greater than TO', () => {
      expect(() => getFullTimestampsList(TO, FROM, GRANULARITY)).toThrow(
        'FROM cannot be greater than TO'
      )
    })

    it('13:00 to 15:00', () => {
      expect(getFullTimestampsList(FROM, TO, GRANULARITY)).toEqual(RESULT)
    })

    it('13:01 to 15:01', () => {
      expect(
        getFullTimestampsList(
          FROM.add(1, 'minutes'),
          TO.add(1, 'minutes'),
          GRANULARITY
        )
      ).toEqual([
        UnixTime.fromDate(new Date('2021-09-07T14:00:00Z')),
        UnixTime.fromDate(new Date('2021-09-07T15:00:00Z')),
      ])
    })

    it('23:00 to 01:00', () => {
      const from = UnixTime.fromDate(new Date('2021-09-07T23:00:00Z'))
      const to = UnixTime.fromDate(new Date('2021-09-08T01:00:00Z'))
      const result = [
        from,
        UnixTime.fromDate(new Date('2021-09-08T00:00:00Z')),
        to,
      ]

      expect(getFullTimestampsList(from, to, GRANULARITY)).toEqual(result)
    })
  })

  describe('daily', () => {
    const GRANULARITY = 'daily'
    const FROM = UnixTime.fromDate(new Date('2021-09-07T00:00:00Z'))
    const TO = UnixTime.fromDate(new Date('2021-09-09T00:00:00Z'))

    const RESULT = [
      FROM,
      UnixTime.fromDate(new Date('2021-09-08T00:00:00Z')),
      TO,
    ]

    it('throws if FROM greater than TO', () => {
      expect(() => getFullTimestampsList(TO, FROM, GRANULARITY)).toThrow(
        'FROM cannot be greater than TO'
      )
    })

    it('07.09.2021 00:00 to 09.09.2021 00:00', () => {
      expect(getFullTimestampsList(FROM, TO, GRANULARITY)).toEqual(RESULT)
    })

    it('07.09.2021 01:00 to 09.09.2021 01:00', () => {
      expect(
        getFullTimestampsList(
          FROM.add(1, 'hours'),
          TO.add(1, 'hours'),
          GRANULARITY
        )
      ).toEqual([
        UnixTime.fromDate(new Date('2021-09-08T00:00:00Z')),
        UnixTime.fromDate(new Date('2021-09-09T00:00:00Z')),
      ])
    })
  })
})

describe(generateRangesToCallHourly.name, () => {
  it('30 days', () => {
    const start = UnixTime.fromDate(new Date('2021-07-01T00:00:00Z'))

    expect(generateRangesToCallHourly(start, start.add(30, 'days'))).toEqual([
      {
        start: start,
        end: start.add(30, 'days'),
      },
    ])
  })

  it('90 days', () => {
    const start = UnixTime.fromDate(new Date('2021-07-01T00:00:00Z'))

    expect(generateRangesToCallHourly(start, start.add(90, 'days'))).toEqual([
      {
        start: start,
        end: start.add(COINGECKO_HOURLY_MAX_SPAN_IN_DAYS, 'days'),
      },
      {
        start: start.add(COINGECKO_HOURLY_MAX_SPAN_IN_DAYS, 'days'),
        end: start.add(90, 'days'),
      },
    ])
  })

  it('180 days', () => {
    const start = UnixTime.fromDate(new Date('2021-07-01T00:00:00Z'))

    expect(generateRangesToCallHourly(start, start.add(180, 'days'))).toEqual([
      {
        start: start,
        end: start.add(COINGECKO_HOURLY_MAX_SPAN_IN_DAYS, 'days'),
      },
      {
        start: start.add(COINGECKO_HOURLY_MAX_SPAN_IN_DAYS, 'days'),
        end: start.add(2 * COINGECKO_HOURLY_MAX_SPAN_IN_DAYS, 'days'),
      },
      {
        start: start.add(2 * COINGECKO_HOURLY_MAX_SPAN_IN_DAYS, 'days'),
        end: start.add(180, 'days'),
      },
    ])
  })
})

describe.skip(CoingeckoQueryService.name + ' e2e tests', function () {
  this.timeout(100000)

  const COIN = CoingeckoId('ethereum')
  const START = UnixTime.fromDate(new Date('2021-01-01T00:00:00Z'))
  const DAYS_SPAN = 90
  const MAX_TRESHOLD_MINUTES = 25
  const EXPECTED_HOURLY_FAULT_RATIO = 0.15

  const httpClient = new HttpClient()
  const coingeckoClient = new CoingeckoClient(httpClient)
  const coingeckoQueryService = new CoingeckoQueryService(coingeckoClient)

  it('daily', async () => {
    const data = await coingeckoQueryService.getUsdPriceHistory(
      COIN,
      START,
      START.add(DAYS_SPAN, 'days'),
      'daily'
    )

    const ratio = getFaultRatio(data)

    expect(ratio).toEqual(0)
  })

  it('hourly', async () => {
    const data = await coingeckoQueryService.getUsdPriceHistory(
      COIN,
      START,
      START.add(DAYS_SPAN, 'days'),
      'hourly'
    )

    const ratio = getFaultRatio(data)

    expect(ratio < EXPECTED_HOURLY_FAULT_RATIO).toEqual(true)

    console.log('Coin = ', COIN)
    console.log('Days span = ', DAYS_SPAN)
    console.log('Max fault [min] = ', MAX_TRESHOLD_MINUTES)
    console.log('=================')
    console.log('Fault ratio = ', Math.round(ratio * 100) / 100)
    console.log('Expected hourly fault ratio = ', EXPECTED_HOURLY_FAULT_RATIO)
    console.log('=================')

    let sum = 0
    data.forEach((point) => (sum += point.deltaMs))
    const average = sum / data.length

    console.log('Average fault [min] = ', average / 1000 / 60)

    let res = 0
    data.forEach((point) => (res += Math.pow(point.deltaMs - average, 2)))
    const deviation = Math.sqrt(res / data.length)
    console.log('Standard deviation [min] = ', deviation / 1000 / 60)
  })

  const getFaultRatio = (data: PriceHistoryPoint[]) => {
    const faultyData = data
      .map((i) => i.deltaMs / 1000 / 60)
      .filter((i) => i > MAX_TRESHOLD_MINUTES)

    return faultyData.length / data.length
  }
})