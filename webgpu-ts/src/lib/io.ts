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

  constructor(elem: HTMLElement) {
    this.$state = mouseState();
    elem.addEventListener("mousemove", (event: MouseEvent) => {
      this.$state.moved = true;
      this.$state.position = {
        x: event.x,
        y: event.y,
      };
    });
    elem.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.buttons & MOUSE_BUTTON_LEFT) {
        this.$state.left = { down: true, up: false, held: true };
      }
    });
    elem.addEventListener("mouseup", (event: MouseEvent) => {
      if (event.buttons & MOUSE_BUTTON_LEFT) {
        this.$state.left = { down: false, up: true, held: false };
      }
    });
    elem.addEventListener("wheel", (event: WheelEvent) => {
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
  constructor(elem: HTMLElement) {
    this.$state = keyboardState();
    elem.addEventListener("onkeydown", (rawEvent: Event) => {
      const event = rawEvent as KeyboardEvent;
      if (event.shiftKey) {
        this.$state.shift = { down: true, up: false, held: true };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.shift = { down: true, up: false, held: true };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.shift = { down: true, up: false, held: true };
        }
      }
      if (event.ctrlKey) {
        this.$state.ctrl = { down: true, up: false, held: true };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.ctrl = { down: true, up: false, held: true };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.ctrl = { down: true, up: false, held: true };
        }
      }
      if (event.altKey) {
        this.$state.alt = { down: true, up: false, held: true };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.alt = { down: true, up: false, held: true };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.alt = { down: true, up: false, held: true };
        }
      }
      if (event.metaKey) {
        this.$state.meta = { down: true, up: false, held: true };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.meta = { down: true, up: false, held: true };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.meta = { down: true, up: false, held: true };
        }
      }
    });
    elem.addEventListener("onkeyup", (rawEvent: Event) => {
      const event = rawEvent as KeyboardEvent;
      if (event.shiftKey) {
        this.$state.shift = { down: false, up: true, held: false };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.shift = { down: false, up: true, held: false };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.shift = { down: false, up: true, held: false };
        }
      }
      if (event.ctrlKey) {
        this.$state.ctrl = { down: false, up: true, held: false };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.ctrl = { down: false, up: true, held: false };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.ctrl = { down: false, up: true, held: false };
        }
      }
      if (event.altKey) {
        this.$state.alt = { down: false, up: true, held: false };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.alt = { down: false, up: true, held: false };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.alt = { down: false, up: true, held: false };
        }
      }
      if (event.metaKey) {
        this.$state.meta = { down: false, up: true, held: false };
        if (event.location === event.DOM_KEY_LOCATION_LEFT) {
          this.$state.left.meta = { down: false, up: true, held: false };
        } else if (event.location === event.DOM_KEY_LOCATION_RIGHT) {
          this.$state.right.meta = { down: false, up: true, held: false };
        }
      }
    });
  }

  poll(): KeyboardState {
    return this.$state;
  }
}
