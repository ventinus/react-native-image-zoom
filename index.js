import React, {Component} from 'react'
import PropTypes from 'prop-types'
import {
  View, PanResponder, Image, Animated
} from 'react-native'
import resolveAssetSource from 'resolveAssetSource'

const clamp = (val, min, max) => Math.max(min, Math.min(max, val))

const calcDistance = (x1, y1, x2, y2) => {
  let dx = Math.abs(x1 - x2)
  let dy = Math.abs(y1 - y2)
  return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2))
}

const calcCenter = (x1, y1, x2, y2) => {
  const middle = (p1, p2) => (p1 + p2) / 2

  return {
    x: middle(x1, x2),
    y: middle(y1, y2)
  }
}

class ImageZoom extends Component {

  static propTypes = {
    source: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    minZoom: PropTypes.number,
    maxZoom: PropTypes.number,
    doubleTapZoom: PropTypes.bool
  }

  static defaultProps = {
    style: {},
    minZoom: 1,
    maxZoom: 4,
    doubleTapZoom: true
  }

  constructor (props) {
    super(props)

    this._panResponder = {}
    this._zoom = 1
    this._previousX = 0
    this._previousY = 0
    this._lastPress = 0
    this._containerDimensions = {width: 0, height: 0}
    this._initialPinchDistance = null
    this._zooming = false
    this._zoomCenter = {x: 0, y: 0}
    this._pinchPanCenter = {x: 0, y: 0}
    // lower the number, faster zoom changes. generally about 100-200 is favorable. also affected by min and max zoom
    this._zoomSensitivity = 200

    const {width, height} = resolveAssetSource(this.props.source)
    this._imageDimensions = {width, height, ratio: [1, height/width]}

    this.state = {
      scale: new Animated.Value(this._zoom),
      pan: new Animated.ValueXY(),
      bounds: null
    }

    this._style = {transform: this._setTransformStyle()}
  }

  componentWillMount () {
    this._panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: this._onPanResponderGrant,
      onPanResponderMove: this._onPanResponderMove,
      onPanResponderRelease: this._onPanResponderRelease,
      onPanResponderTerminate: this._onPanResponderRelease
    })
  }

  render () {
    return (
      <View style={this.props.style} onLayout={this._onContainerLayout}>
        <Animated.View
          style={[this.state.pan.getLayout(), this._style]}
          {...this._panResponder.panHandlers}
        >
          <Image resizeMode='contain' source={this.props.source} />
        </Animated.View>
      </View>
    )
  }

  _onContainerLayout = (e) => {
    if (this._containerDimensions.width !== 0 && this._containerDimensions.height !== 0) return

    const {width, height} = e.nativeEvent.layout
    this._containerDimensions = {width, height}
    this._style.transform = this._setTransformStyle()
    this.setState({bounds: this._setBounds()})
  }

  _setTransformStyle = () => {
    const containerWOverImageW = this._containerDimensions.width / this._imageDimensions.width
    return [
      {
        scale: this.state.scale.interpolate({
          inputRange: [this.props.minZoom, this.props.maxZoom],
          outputRange: [containerWOverImageW, containerWOverImageW * this.props.maxZoom]
        })
      },
      {translateX: this._previousX},
      {translateY: this._previousY}
    ]
  }

  _checkDoubleTap = () => {
    const pressTime = new Date().getTime()
    if (pressTime - this._lastPress < 200) {
      const {minZoom, maxZoom} = this.props
      const newZoom = this._zoom === maxZoom ? minZoom : maxZoom
      this._setZoom(newZoom)
    }

    this._lastPress = pressTime
  }

  _onPanResponderGrant = (e, gestureState) => {
    if (this.props.doubleTapZoom) {
      this._checkDoubleTap()
    }
  }

  _onPanResponderMove = (e, gestureState) => {
    const {touches} = e.nativeEvent
    if (this._zooming && touches.length !== 2) {
      return
    }

    switch (touches.length) {
      case 1:
        this._processPan(gestureState)
        break
      case 2:
        this._processPinch(touches)
        break
      default:
        console.log('some other touch count', touches.length)
        break
    }
  }

  _onPanResponderRelease = (e, gestureState) => {
    if (!this._zooming) {
      this._previousX = this._previousX + gestureState.dx
      this._previousY = this._previousY + gestureState.dy
    }
    this._setZoom(this._zoom)
    this._zooming = false
    this._initialPinchDistance = null
  }

  _processPan = (gestureState) => {
    const movement = {
      x: this._previousX + gestureState.dx,
      y: this._previousY + gestureState.dy
    }

    this.state.pan.setValue(movement)
  }

  _processPinch = ([first, second]) => {
    const distance = calcDistance(first.pageX, first.pageY, second.pageX, second.pageY)
    const distanceDiff = !this._initialPinchDistance ? 0 : distance - this._initialPinchDistance
    const center = calcCenter(first.locationX, first.locationY, second.locationX, second.locationY)
    const pinchPanCenter = calcCenter(first.pageX, first.pageY, second.pageX, second.pageY)
    const zoomChange = distanceDiff / this._zoomSensitivity

    let centerChange = {x: 0, y: 0}
    if (this._zooming) {
      centerChange = {
        x: this._pinchPanCenter.x - pinchPanCenter.x,
        y: this._pinchPanCenter.y - pinchPanCenter.y
      }
    }

    // update the current zooming center so that we know the values in _setZoom from _onPanResponderRelease
    this._zoomCenter = center
    this._pinchPanCenter = pinchPanCenter

    const {dx, dy} = this._getXYDeltasFromZoomChange(this._zoomCenter, zoomChange)

    this._zoom = Math.max(0.4, this._zoom + zoomChange)
    this._initialPinchDistance = distance

    this.state.scale.setValue(this._zoom)

    this._previousX += dx - centerChange.x
    this._previousY += dy - centerChange.y

    this.state.pan.setValue({
      x: this._previousX,
      y: this._previousY
    })

    this.setState({bounds: this._setBounds()})
    this._zooming = true
  }

  _setZoom = (newZoom) => {
    this._zoom = clamp(newZoom, this.props.minZoom, this.props.maxZoom)

    this.setState(
      {bounds: this._setBounds()},
      () => {
        const {min, max} = this.state.bounds
        const {dx, dy} = this._getXYDeltasFromZoomChange(this._zoomCenter, this._zoom - newZoom)

        this._previousX = clamp(this._previousX + dx, min.x, max.x)
        this._previousY = clamp(this._previousY + dy, min.y, max.y)

        Animated.parallel([
          this._animateToCurrentZoom(),
          this._animateToCurrentPan()
        ]).start()
      }
    )
  }

  _getXYDeltasFromZoomChange = ({x, y}, zoomChange) => {
    const xChange = this._containerDimensions.width * zoomChange
    const percentages = {
      XFromCenter: 0.5 - x/this._imageDimensions.width,
      YFromCenter: 0.5 - y/this._imageDimensions.height
    }
    return {
      dx: xChange * percentages.XFromCenter,
      dy: xChange * percentages.YFromCenter
    }
  }

  _animateToCurrentPan = () => {
    return Animated.timing(this.state.pan, {
      toValue: {
        x: this._previousX,
        y: this._previousY
      },
      duration: 300,
    })
  }

  _animateToCurrentZoom = () => {
    return Animated.timing(this.state.scale, {
      toValue: this._zoom,
      duration: 300
    })
  }

  _getImageSize = () => {
    const width = this._containerDimensions.width * this._zoom
    return {
      width,
      height: width * this._imageDimensions.ratio[1]
    }
  }

  // an improvement is to check for which edges will be the measurement for bounds
  // currently assumes the images sides will hit the container bounds first
  _setBounds = () => {
    const {_containerDimensions, _imageDimensions} = this
    if (!_containerDimensions) return null

    const imageHeight = _imageDimensions.ratio[1] * _containerDimensions.width * this._zoom
    const heightDiff = (_containerDimensions.height - imageHeight) / 2

    const calcBounds = (isMin) => {
      return {
        x: _containerDimensions.width * (this._zoom - 1) / 2 * (isMin ? -1 : 1),
        y: heightDiff >= 0 ? 0 : heightDiff * (isMin ? 1 : -1)
      }
    }

    return {
      min: calcBounds(true),
      max: calcBounds(false)
    }
  }
}

export default ImageZoom
