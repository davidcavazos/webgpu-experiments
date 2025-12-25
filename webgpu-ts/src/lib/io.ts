// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
const MOUSE_BUTTON_LEFT /*       */ = 0b00001;
const MOUSE_BUTTON_RIGHT /*      */ = 0b00010;
const MOUSE_BUTTON_MIDDLE /*     */ = 0b00100;
const MOUSE_BUTTON_BACK /*       */ = 0b01000;
const MOUSE_BUTTON_FORWARD /*    */ = 0b10000;

export interface Coord2D {
  x: number;
  y: number;
}

export interface ButtonState {
  down: boolean;
  up: boolean;
  held: boolean;
}

function buttonState(state?: ButtonState): ButtonState {
  return { down: false, up: false, held: state?.held ?? false };
}

const buttonDown = { down: true, up: false, held: true };
const buttonUp = { down: false, up: true, held: false };

export interface MouseScroll {
  x: number;
  y: number;
  z: number;
}

export interface MouseState {
  position: Coord2D;
  scroll: MouseScroll | undefined;
  moved: boolean;
  left: ButtonState;
  right: ButtonState;
  middle: ButtonState;
  back: ButtonState;
  forward: ButtonState;
}

function mouseState(state?: MouseState): MouseState {
  return {
    position: state?.position ?? { x: 0, y: 0 },
    scroll: undefined,
    moved: false,
    left: buttonState(state?.left),
    right: buttonState(state?.right),
    middle: buttonState(state?.middle),
    back: buttonState(state?.back),
    forward: buttonState(state?.forward),
  };
}

export class Mouse {
  $state: MouseState;

  constructor() {
    this.$state = mouseState();

    window.addEventListener("mousemove", (event: MouseEvent) => {
      this.$state.moved = true;
      this.$state.position = {
        x: event.x,
        y: event.y,
      };
    });

    window.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.buttons & MOUSE_BUTTON_LEFT) {
        this.$state.left = buttonDown;
      }
    });

    window.addEventListener("mouseup", (event: MouseEvent) => {
      if (event.buttons & MOUSE_BUTTON_LEFT) {
        this.$state.left = buttonDown;
      }
    });

    window.addEventListener("wheel", (event: WheelEvent) => {
      const current = this.$state.scroll ?? { x: 0, y: 0, z: 0 };
      this.$state.scroll = {
        x: current.x + event.deltaX,
        y: current.y + event.deltaY,
        z: current.z + event.deltaZ,
      };
    });
  }

  poll(): MouseState {
    const state = { ...this.$state };
    this.$state = mouseState(state);
    return state;
  }
}

export interface KeyboardState {
  shift: ButtonState;
  ctrl: ButtonState;
  alt: ButtonState;
  meta: ButtonState;
  left: {
    shift: ButtonState;
    ctrl: ButtonState;
    alt: ButtonState;
    meta: ButtonState;
  };
  right: {
    shift: ButtonState;
    ctrl: ButtonState;
    alt: ButtonState;
    meta: ButtonState;
  };
  // TODO: support all keys
}

function keyboardState(state?: KeyboardState): KeyboardState {
  return {
    shift: buttonState(state?.shift),
    ctrl: buttonState(state?.ctrl),
    alt: buttonState(state?.alt),
    meta: buttonState(state?.meta),
    left: {
      shift: buttonState(state?.left.shift),
      ctrl: buttonState(state?.left.ctrl),
      alt: buttonState(state?.left.alt),
      meta: buttonState(state?.left.meta),
    },
    right: {
      shift: buttonState(state?.right.shift),
      ctrl: buttonState(state?.right.ctrl),
      alt: buttonState(state?.right.alt),
      meta: buttonState(state?.right.meta),
    },
  };
}

export class Keyboard {
  $state: KeyboardState;
  constructor() {
    this.$state = keyboardState();

    window.addEventListener("keydown", (event: KeyboardEvent) => {
      switch (event.key) {
        case "Shift":
          this.$state.shift = buttonDown;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.shift = buttonDown;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.shift = buttonDown;
          }
          break;
        case "Control":
          this.$state.ctrl = buttonDown;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.ctrl = buttonDown;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.ctrl = buttonDown;
          }
          break;
        case "Alt":
          this.$state.alt = buttonDown;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.alt = buttonDown;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.alt = buttonDown;
          }
          break;
        case "Meta":
          this.$state.meta = buttonDown;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.meta = buttonDown;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.meta = buttonDown;
          }
          break;
        default:
          console.log(event);
      }
    });

    window.addEventListener("keyup", (event: KeyboardEvent) => {
      switch (event.key) {
        case "Shift":
          this.$state.shift = buttonUp;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.shift = buttonUp;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.shift = buttonUp;
          }
          break;
        case "Control":
          this.$state.ctrl = buttonUp;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.ctrl = buttonUp;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.ctrl = buttonUp;
          }
          break;
        case "Alt":
          this.$state.alt = buttonUp;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.alt = buttonUp;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.alt = buttonUp;
          }
          break;
        case "Meta":
          this.$state.meta = buttonUp;
          if (event.location === event.DOM_KEY_LOCATION_LEFT) {
            this.$state.left.meta = buttonUp;
          } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
            this.$state.right.meta = buttonUp;
          }
          break;
        default:
          console.log(event);
      }
    });
  }

  poll(): KeyboardState {
    const state = { ...this.$state };
    this.$state = keyboardState(state);
    return state;
  }
}
