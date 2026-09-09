import {
  useMemo,
  useState,
} from 'react'

import './EventAdminCalendar.css'


const DAY_LABELS = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
]


function pad2(
  value
) {
  return String(
    value
  )
    .padStart(
      2,
      '0'
    )
}


function localDateKey(
  date
) {
  return (
    date.getFullYear() +
    '-' +
    pad2(
      date.getMonth() +
      1
    ) +
    '-' +
    pad2(
      date.getDate()
    )
  )
}


function todayKey() {
  return localDateKey(
    new Date()
  )
}


function monthStartFromKey(
  value
) {
  const match =
    String(
      value ||
      ''
    )
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      )


  if (
    !match
  ) {
    const now =
      new Date()


    return new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )
  }


  return new Date(
    Number(
      match[1]
    ),
    Number(
      match[2]
    ) -
      1,
    1
  )
}


function monthLabel(
  monthStart
) {
  return monthStart
    .toLocaleDateString(
      'en-CA',
      {
        month:
          'long',

        year:
          'numeric',
      }
    )
    .toUpperCase()
}


function formatSelectedDate(
  value
) {
  const match =
    String(
      value ||
      ''
    )
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      )


  if (
    !match
  ) {
    return value ||
      ''
  }


  return new Date(
    Number(
      match[1]
    ),
    Number(
      match[2]
    ) -
      1,
    Number(
      match[3]
    )
  )
    .toLocaleDateString(
      'en-CA',
      {
        weekday:
          'long',

        month:
          'long',

        day:
          'numeric',

        year:
          'numeric',
      }
    )
    .toUpperCase()
}


function formatEventTime(
  value
) {
  const match =
    String(
      value ||
      ''
    )
      .match(
        /^(\d{1,2}):(\d{2})/
      )


  if (
    !match
  ) {
    return ''
  }


  const hour24 =
    Number(
      match[1]
    )


  const hour12 =
    hour24 %
      12 ||
    12


  const period =
    hour24 >=
      12
      ? 'PM'
      : 'AM'


  return (
    `${hour12}:${match[2]} ${period}`
  )
}


function getEventDateKey(
  record
) {
  return String(
    record?.eventDate ||
    ''
  )
    .slice(
      0,
      10
    )
}


function EventAdminCalendar({
  records = [],
  onAddEvent,
  onEditEvent,
  calendarLabel =
    'EVENTS CALENDAR',
  singularLabel =
    'EVENT',
  pluralLabel =
    'EVENTS',
  addLabel =
    '+ ADD EVENT',
  emptyLabel =
    'NO EVENTS ON THIS DATE.',
  untitledLabel =
    'UNTITLED EVENT',
}) {
  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState(
      todayKey()
    )


  const [
    visibleMonth,
    setVisibleMonth,
  ] =
    useState(
      () =>
        monthStartFromKey(
          todayKey()
        )
    )


  const eventsByDate =
    useMemo(
      () => {
        const grouped =
          new Map()


        ;(
          Array.isArray(
            records
          )
            ? records
            : []
        )
          .filter(
            (record) =>
              record?.active !==
                false &&
              getEventDateKey(
                record
              )
          )
          .forEach(
            (record) => {
              const key =
                getEventDateKey(
                  record
                )


              if (
                !grouped.has(
                  key
                )
              ) {
                grouped.set(
                  key,
                  []
                )
              }


              grouped
                .get(
                  key
                )
                .push(
                  record
                )
            }
          )


        grouped.forEach(
          (dayEvents) => {
            dayEvents.sort(
              (
                a,
                b
              ) =>
                String(
                  a?.startTime ||
                  '99:99'
                )
                  .localeCompare(
                    String(
                      b?.startTime ||
                      '99:99'
                    )
                  ) ||
                String(
                  a?.title ||
                  ''
                )
                  .localeCompare(
                    String(
                      b?.title ||
                      ''
                    )
                  )
            )
          }
        )


        return grouped
      },
      [
        records,
      ]
    )


  const calendarDays =
    useMemo(
      () => {
        const firstDay =
          new Date(
            visibleMonth.getFullYear(),
            visibleMonth.getMonth(),
            1
          )


        const firstCell =
          new Date(
            firstDay
          )


        firstCell.setDate(
          firstCell.getDate() -
          firstDay.getDay()
        )


        return Array.from(
          {
            length:
              42,
          },
          (
            _,
            index
          ) => {
            const date =
              new Date(
                firstCell
              )


            date.setDate(
              firstCell.getDate() +
              index
            )


            return {
              date,

              key:
                localDateKey(
                  date
                ),

              currentMonth:
                date.getMonth() ===
                visibleMonth.getMonth(),
            }
          }
        )
      },
      [
        visibleMonth,
      ]
    )


  const selectedEvents =
    eventsByDate.get(
      selectedDate
    ) ||
    []


  function changeMonth(
    amount
  ) {
    const next =
      new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() +
          amount,
        1
      )


    setVisibleMonth(
      next
    )


    setSelectedDate(
      localDateKey(
        next
      )
    )
  }


  function goToday() {
    const key =
      todayKey()


    setSelectedDate(
      key
    )


    setVisibleMonth(
      monthStartFromKey(
        key
      )
    )
  }


  return (
    <section className="event-admin-calendar">
      <div className="event-admin-calendar-header">
        <div>
          <div className="event-admin-calendar-kicker">
            {calendarLabel}
          </div>

          <div className="event-admin-calendar-month">
            {monthLabel(
              visibleMonth
            )}
          </div>
        </div>


        <div className="event-admin-calendar-nav">
          <button
            type="button"
            onClick={() =>
              changeMonth(
                -1
              )
            }
            aria-label="Previous month"
          >
            ←
          </button>

          <button
            type="button"
            onClick={
              goToday
            }
          >
            TODAY
          </button>

          <button
            type="button"
            onClick={() =>
              changeMonth(
                1
              )
            }
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>


      <div className="event-admin-calendar-weekdays">
        {DAY_LABELS.map(
          (label) => (
            <div
              key={
                label
              }
            >
              {label}
            </div>
          )
        )}
      </div>


      <div className="event-admin-calendar-grid">
        {calendarDays.map(
          (
            day
          ) => {
            const dayEvents =
              eventsByDate.get(
                day.key
              ) ||
              []


            const classes = [
              'event-admin-calendar-day',
              day.currentMonth
                ? ''
                : 'event-admin-calendar-day-muted',
              day.key ===
                selectedDate
                ? 'event-admin-calendar-day-selected'
                : '',
              day.key ===
                todayKey()
                ? 'event-admin-calendar-day-today'
                : '',
            ]
              .filter(
                Boolean
              )
              .join(
                ' '
              )


            return (
              <button
                type="button"
                className={
                  classes
                }
                key={
                  day.key
                }
                onClick={() => {
                  setSelectedDate(
                    day.key
                  )


                  if (
                    !day.currentMonth
                  ) {
                    setVisibleMonth(
                      monthStartFromKey(
                        day.key
                      )
                    )
                  }
                }}
              >
                <span className="event-admin-calendar-day-number">
                  {day.date.getDate()}
                </span>

                {dayEvents.length >
                  0 && (
                  <span className="event-admin-calendar-day-count">
                    {dayEvents.length}
                  </span>
                )}
              </button>
            )
          }
        )}
      </div>


      <div className="event-admin-calendar-agenda">
        <div className="event-admin-calendar-agenda-header">
          <div>
            <div className="event-admin-calendar-agenda-date">
              {formatSelectedDate(
                selectedDate
              )}
            </div>

            <div className="event-admin-calendar-agenda-count">
              {selectedEvents.length ===
                1
                ? `1 ${singularLabel}`
                : `${selectedEvents.length} ${pluralLabel}`}
            </div>
          </div>


          <button
            type="button"
            className="event-admin-calendar-add"
            onClick={() =>
              onAddEvent?.(
                selectedDate
              )
            }
          >
            {addLabel}
          </button>
        </div>


        {selectedEvents.length ===
          0
          ? (
              <div className="event-admin-calendar-empty">
                {emptyLabel}
              </div>
            )
          : (
              <div className="event-admin-calendar-list">
                {selectedEvents.map(
                  (
                    record,
                    index
                  ) => (
                    <button
                      type="button"
                      className="event-admin-calendar-event"
                      key={
                        record.id ||
                        record.externalId ||
                        `${selectedDate}-${index}`
                      }
                      onClick={() =>
                        onEditEvent?.(
                          record
                        )
                      }
                    >
                      <span className="event-admin-calendar-event-time">
                        {formatEventTime(
                          record.startTime
                        ) ||
                          'TIME TBD'}
                      </span>

                      <span className="event-admin-calendar-event-copy">
                        <strong>
                          {record.title ||
                            untitledLabel}
                        </strong>

                        <span>
                          {record.venue ||
                            record.location ||
                            'VENUE TBD'}
                        </span>
                      </span>

                      <span className="event-admin-calendar-event-edit">
                        EDIT
                      </span>
                    </button>
                  )
                )}
              </div>
            )}
      </div>
    </section>
  )
}


export default EventAdminCalendar