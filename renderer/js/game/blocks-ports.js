/* Vextra blocks – port layout: which outputs belong to the object a block sends (one output per key) and which ports are optional
   (hidden on the canvas until they are wired, or added under "Ports" in the block's settings, so blocks stay small).
   Loaded after every block file; also part of exported games because the runtime needs the key table to deliver each key. */
(function () {
  const VXRT = window.VXRT; if (!VXRT || !VXRT.setKeys) return;
  const K = (keys, show) => ({ out: { keys, show: show || keys.slice(0, 4) } });
  /* blocks that send an object on "out": each key becomes an output */
  VXRT.setKeys('calendar', K(['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'timestamp', 'dayName', 'monthName', 'date', 'time', 'isWeekend', 'isDaytime'], ['year', 'month', 'day']));
  VXRT.setKeys('clock', K(['hours', 'minutes', 'seconds', 'total'], []));
  VXRT.setKeys('joystick', K(['x', 'y', 'angle', 'force']));
  VXRT.setKeys('touchLook', K(['dx', 'dy']));
  VXRT.setKeys('accelerometer', K(['x', 'y', 'z']));
  VXRT.setKeys('microphone', K(['level', 'pitch', 'low', 'mid', 'high'], ['level', 'pitch']));
  VXRT.setKeys('hearing', K(['x', 'y', 'z', 'distance'], ['x', 'y', 'distance']));
  VXRT.setKeys('colorTracker', K(['x', 'y', 'size']));
  VXRT.setKeys('faceTracker', K(['x', 'y', 'size']));
  VXRT.setKeys('vrHead', K(['x', 'y', 'z', 'yaw', 'pitch', 'roll'], ['x', 'y', 'z', 'yaw']));
  VXRT.setKeys('vrController', K(['x', 'y', 'z', 'trigger', 'grip', 'stickX', 'stickY'], ['x', 'y', 'z', 'trigger']));
  VXRT.setKeys('arPlace', K(['x', 'y', 'z']));
  /* blocks with many inputs / outputs where only a few are needed most of the time */
  VXRT.optPorts('expression', { in: ['c', 'd', 'e', 'f'], out: ['error'] });
  VXRT.optPorts('globalVariable', { in: ['get', 'reset'], out: ['changed'] });
  VXRT.optPorts('objectVariable', { in: ['get', 'reset'], out: ['changed'] });
  VXRT.optPorts('filter', { in: ['reset'] });
  VXRT.optPorts('ease', { in: ['stop', 'reverse'] });
  VXRT.optPorts('repeater', { in: ['stop'] });
  VXRT.optPorts('timer', { in: ['stop', 'reset'] });
  VXRT.optPorts('clock', { in: ['reset', 'toggle'] });
  VXRT.optPorts('collision', { out: ['side'] });
  VXRT.optPorts('mailbox', { out: ['sender'] });
  VXRT.optPorts('mouseWheel', { out: ['up', 'down'] });
})();
