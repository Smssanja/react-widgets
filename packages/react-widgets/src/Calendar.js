import React from 'react';
import { findDOMNode } from 'react-dom';
import PropTypes from 'prop-types';
import cn from 'classnames';
import uncontrollable from 'uncontrollable';
import { autoFocus } from 'react-component-managers';

import Widget from './Widget';
import Header from './Header';
import Footer from './Footer';
import Month from './Month';
import Year from './Year';
import Decade from './Decade';
import Century from './Century';
import { getMessages } from './messages';
import SlideTransitionGroup from './SlideTransitionGroup';
import focusManager from './util/focusManager';

import { date as dateLocalizer } from './util/localizers';
import * as CustomPropTypes from './util/PropTypes';
import * as constants from './util/constants';
import * as Props from './util/Props';
import dates from './util/dates';
import withRightToLeft from './util/withRightToLeft';
import { instanceId, notify } from './util/widgetHelpers';
import { widgetEditable } from './util/interaction';

let { DOWN, UP, LEFT, RIGHT } = constants.directions

let last = a => a[a.length - 1];

let views = constants.calendarViews
let VIEW_OPTIONS = Object.keys(views).map(k => views[k])
let VIEW_UNIT = constants.calendarViewUnits
let VIEW  = {
  [views.MONTH]:   Month,
  [views.YEAR]:    Year,
  [views.DECADE]:  Decade,
  [views.CENTURY]: Century
};

let ARROWS_TO_DIRECTION = {
  ArrowDown: DOWN,
  ArrowUp: UP,
  ArrowRight: RIGHT,
  ArrowLeft: LEFT
}

let OPPOSITE_DIRECTION = {
  [LEFT]: RIGHT,
  [RIGHT]: LEFT
};

let MULTIPLIER = {
  [views.YEAR]:    1,
  [views.DECADE]:  10,
  [views.CENTURY]: 100
};

let propTypes = {
  ...autoFocus.propTypes,

  activeId: PropTypes.string,
  disabled: CustomPropTypes.disabled,
  readOnly: CustomPropTypes.disabled,

  onChange: PropTypes.func,
  value: PropTypes.instanceOf(Date),

  min: PropTypes.instanceOf(Date).isRequired,
  max: PropTypes.instanceOf(Date).isRequired,

  currentDate: PropTypes.instanceOf(Date),
  onCurrentDateChange: PropTypes.func,

  view(props, ...args) {
    return PropTypes.oneOf(props.views || VIEW_OPTIONS)(props, ...args);
  },

  views: PropTypes.arrayOf(
    PropTypes.oneOf(VIEW_OPTIONS)
  ).isRequired,

  onViewChange: PropTypes.func,
  onNavigate: PropTypes.func,
  culture: PropTypes.string,
  footer: PropTypes.bool,

  dayComponent: CustomPropTypes.elementType,
  headerFormat: CustomPropTypes.dateFormat,
  footerFormat: CustomPropTypes.dateFormat,

  dayFormat: CustomPropTypes.dateFormat,
  dateFormat: CustomPropTypes.dateFormat,
  monthFormat: CustomPropTypes.dateFormat,
  yearFormat: CustomPropTypes.dateFormat,
  decadeFormat: CustomPropTypes.dateFormat,
  centuryFormat: CustomPropTypes.dateFormat,

  messages: PropTypes.shape({
    moveBack: PropTypes.string,
    moveForward: PropTypes.string
  })
}

@withRightToLeft
class Calendar extends React.Component {
  static displayName = 'Calendar';

  static propTypes = propTypes;

  static defaultProps = {
    value: null,
    min: new Date(1900, 0, 1),
    max: new Date(2099, 11, 31),
    views: VIEW_OPTIONS,
    tabIndex: '0',
    footer: true,
  };

  static Transition = SlideTransitionGroup;

  constructor(...args) {
    super(...args)

    this.messages = getMessages(this.props.messages)

    this.viewId = instanceId(this, '_calendar')
    this.labelId = instanceId(this, '_calendar_label')
    this.activeId = (
      this.props.activeId ||
      instanceId(this, '_calendar_active_cell')
    )

    autoFocus(this);

    this.focusManager = focusManager(this, {
      willHandle: this.handleFocusWillChange,
    })

    let { view, views } = this.props;
    this.state = {
      selectedIndex: 0,
      view: view || views[0]
    }
  }

  componentWillReceiveProps({ messages, view, views, value, currentDate }) {
    let val  = this.inRangeValue(value);

    this.messages = getMessages(messages)

    view = view || views[0]

    this.setState({
      view,
      slideDirection: this.getSlideDirection({ view, views, currentDate }),
    })

    //if the value changes reset views to the new one
    if (!dates.eq(val, dateOrNull(this.props.value), VIEW_UNIT[view])) {
      this.setCurrentDate(val, currentDate)
    }
  }

  handleFocusWillChange = () => {
    if (this.props.tabIndex == -1)
      return false
  }

  @widgetEditable
  handleViewChange = () => {
    this.navigate(UP);
  }

  @widgetEditable
  handleMoveBack = () => {
    this.navigate(LEFT);
  }

  @widgetEditable
  handleMoveForward = () => {
    this.navigate(RIGHT);
  }

  @widgetEditable
  handleChange = (date) => {
    let { views, onChange } = this.props
    let { view } = this.state

    if (views[0] === view) {
      this.setCurrentDate(date)

      notify(onChange, date)

      this.focus();
      return;
    }

    this.navigate(DOWN, date)
  };

  @widgetEditable
  handleFooterClick = (date) => {
    let { views, min, max, onViewChange } = this.props;

    let firstView = views[0]

    notify(this.props.onChange, date)

    if (dates.inRange(date, min, max, firstView)) {
      this.focus();

      this.setCurrentDate(date);

      notify(onViewChange, [firstView])
    }
  };

  @widgetEditable
  handleKeyDown = (e) => {
    let ctrl = e.ctrlKey || e.metaKey
      , key  = e.key
      , direction = ARROWS_TO_DIRECTION[key]
      , currentDate = this.getCurrentDate()
      , view = this.state.view
      , unit = VIEW_UNIT[view];

    if (key === 'Enter') {
      e.preventDefault()
      return this.handleChange(currentDate)
    }

    if (direction) {
      if (ctrl) {
        e.preventDefault()
        this.navigate(direction)
      }
      else {
        if (this.isRtl() && OPPOSITE_DIRECTION[direction])
          direction = OPPOSITE_DIRECTION[direction]

        let nextDate = dates.move(
          currentDate,
          this.props.min,
          this.props.max,
          view,
          direction
        )

        if (!dates.eq(currentDate, nextDate, unit)) {
          e.preventDefault()

          if (dates.gt(nextDate, currentDate, view))
            this.navigate(RIGHT, nextDate)

          else if (dates.lt(nextDate, currentDate, view))
            this.navigate(LEFT, nextDate)

          else
            this.setCurrentDate(nextDate)
        }
      }
    }

    notify(this.props.onKeyDown, [e])
  };

  render() {
    let {
        className
      , value
      , footerFormat
      , disabled
      , readOnly
      , footer
      , views
      , min
      , max
      , culture
      , tabIndex } = this.props

    let { view, slideDirection, focused } = this.state;
    let currentDate = this.getCurrentDate();

    let View = VIEW[view]
      , todaysDate = new Date()
      , todayNotInRange = !dates.inRange(todaysDate, min, max, view)

    let key = view + '_' + dates[view](currentDate);

    let elementProps = Props.pickElementProps(this)
      , viewProps  = Props.pick(this.props, View)

    let isDisabled = disabled || readOnly

    return (
      <Widget
        {...elementProps}
        role='group'
        focused={focused}
        disabled={disabled}
        readOnly={readOnly}
        tabIndex={tabIndex || 0}
        onKeyDown={this.handleKeyDown}
        onBlur={this.focusManager.handleBlur}
        onFocus={this.focusManager.handleFocus}
        className={cn(className, 'rw-calendar rw-widget-container')}
        aria-activedescendant={this.activeId}
      >
        <Header
          label={this.getHeaderLabel()}
          labelId={this.labelId}
          messages={this.messages}
          upDisabled={isDisabled || view === last(views)}
          prevDisabled={isDisabled || !dates.inRange(this.nextDate(LEFT), min, max, view)}
          nextDisabled={isDisabled || !dates.inRange(this.nextDate(RIGHT), min, max, view)}
          onViewChange={this.handleViewChange}
          onMoveLeft ={this.handleMoveBack}
          onMoveRight={this.handleMoveForward}
        />
        <Calendar.Transition direction={slideDirection}>
          <View
            {...viewProps}
            key={key}
            id={this.viewId}
            activeId={this.activeId}
            value={value}
            today={todaysDate}
            disabled={disabled}
            focused={currentDate}
            onChange={this.handleChange}
            onKeyDown={this.handleKeyDown}
            aria-labelledby={this.labelId}
          />
        </Calendar.Transition>
        {footer &&
          <Footer
            value={todaysDate}
            format={footerFormat}
            culture={culture}
            disabled={disabled || todayNotInRange}
            readOnly={readOnly}
            onClick={this.handleFooterClick}
          />
        }
      </Widget>
    )
  }

  navigate(direction, date) {
    let { views, min, max, onNavigate, onViewChange } = this.props;
    let { view } = this.state

    let slideDir = (direction === LEFT || direction === UP)
          ? 'right' : 'left';

    if (direction === UP)
      view = views[views.indexOf(view) + 1] || view

    if (direction === DOWN)
      view = views[views.indexOf(view) - 1] || view

    if (!date)
      date = [LEFT, RIGHT].indexOf(direction) !== -1
        ? this.nextDate(direction)
        : this.getCurrentDate()

    if (dates.inRange(date, min, max, view)) {
      notify(onNavigate, [date, slideDir, view])

      this.focus(true)
      this.setCurrentDate(date)
      notify(onViewChange, [view])
    }
  }

  focus() {
    if (+this.props.tabIndex > -1)
      findDOMNode(this).focus()
  }

  getCurrentDate() {
    return this.props.currentDate || this.props.value || new Date()
  }

  setCurrentDate(date, currentDate = this.getCurrentDate()) {
    let inRangeDate = this.inRangeValue(date ? new Date(date) : currentDate)

    if (dates.eq(inRangeDate, dateOrNull(currentDate), VIEW_UNIT[this.state.view]))
      return

    notify(this.props.onCurrentDateChange, inRangeDate)
  }

  nextDate(direction) {
    let method = direction === LEFT ? 'subtract' : 'add'
      , view   = this.state.view
      , unit   = view === views.MONTH ? view : views.YEAR
      , multi  = MULTIPLIER[view] || 1;

    return dates[method](this.getCurrentDate(), 1 * multi, unit)
  }

  getHeaderLabel() {
    let {
        culture
      , decadeFormat
      , yearFormat
      , headerFormat
      , centuryFormat } = this.props
      , view = this.state.view
      , currentDate = this.getCurrentDate();

    switch (view) {
      case views.MONTH:
        headerFormat = dateLocalizer.getFormat('header', headerFormat)
        return dateLocalizer.format(currentDate, headerFormat, culture)

      case views.YEAR:
        yearFormat = dateLocalizer.getFormat('year', yearFormat)
        return dateLocalizer.format(currentDate, yearFormat, culture)

      case views.DECADE:
        decadeFormat = dateLocalizer.getFormat('decade', decadeFormat)
        return dateLocalizer.format(
          dates.startOf(currentDate, 'decade'),
          decadeFormat,
          culture
        )
      case views.CENTURY:
        centuryFormat = dateLocalizer.getFormat('century', centuryFormat)
        return dateLocalizer.format(
          dates.startOf(currentDate, 'century'),
          centuryFormat,
          culture
        )
    }
  }

  inRangeValue(_value) {
    let value = dateOrNull(_value)

    if (value === null) return value

    return dates.max(
      dates.min(value, this.props.max),
      this.props.min
    )
  }

  isValidView(next, views = this.props.views) {
    return views.indexOf(next) !== -1
  }

  getSlideDirection({ view, currentDate, views }) {
    let { currentDate: lastDate } = this.props;
    let { slideDirection, view: lastView } = this.state;

    if (lastView !== view) {
      return views.indexOf(lastView) > views.indexOf(view) ? 'top' : 'bottom';
    }
    if (lastDate !== currentDate) {
      return dates.gt(currentDate, lastDate) ? 'left' : 'right'
    }

    return slideDirection
  }
}

function dateOrNull(dt) {
  if (dt && !isNaN(dt.getTime())) return dt
  return null
}


export default uncontrollable(Calendar, {
  value: 'onChange',
  currentDate: 'onCurrentDateChange',
  view: 'onViewChange'
}, ['focus']);
