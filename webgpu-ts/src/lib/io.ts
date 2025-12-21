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

export interface MouseScroll {
  x: number;
  y: number;
  z: number;
}

export interface MouseState {
  position: Coord2D;
  scroll: MouseScroll | undefined;
  moved: boolean;
  clickedLeft: boolean;
  pressedLeft: boolean;
}

function mouseStateClean(): MouseState {
  return {
    position: { x: 0, y: 0 },
    scroll: undefined,
    moved: false,
    clickedLeft: false,
    pressedLeft: false,
  };
}

export class Mouse {
  state: MouseState;

  constructor(elem: HTMLElement) {
    this.state = mouseStateClean();
    elem.addEventListener("mousemove", (event: MouseEvent) => {
      this.state.moved = true;
      this.state.position = {
        x: event.x,
        y: event.y,
      };
    });
    elem.addEventListener("click", (event: MouseEvent) => {
      if (event.buttons & MOUSE_BUTTON_LEFT) {
        this.state.clickedLeft = true;
      }
    });
    elem.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.buttons & MOUSE_BUTTON_LEFT) {
        this.state.pressedLeft = true;
      }
    });
    elem.addEventListener("mouseup", (event: MouseEvent) => {
      if (event.buttons & MOUSE_BUTTON_LEFT) {
        this.state.pressedLeft = false;
      }
    });
    elem.addEventListener("wheel", (event: WheelEvent) => {
      const current = this.state.scroll ?? { x: 0, y: 0, z: 0 };
      this.state.scroll = {
        x: current.x + event.deltaX,
        y: current.y + event.deltaY,
        z: current.z + event.deltaZ,
      };
    });
  }

  poll(): MouseState {
    const state = { ...this.state };
    this.state = {
      ...mouseStateClean(),
      position: state.position,
      pressedLeft: state.pressedLeft,
    };
    return state;
  }

  // click(): boolean {}
}
