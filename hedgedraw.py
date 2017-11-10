from __future__ import print_function
import sys
try:
    import numpy as np
    import matplotlib.pyplot as plt
except:
    print('run `pip install numpy matplotlib --user`')

class DraggableRectangle:
    def __init__(self, rect, arr):
        self.rect = rect
        self.arr = arr
        self.press = False

    def connect(self):
        'connect to all the events we need'
        self.cidpress = self.rect.figure.canvas.mpl_connect(
            'button_press_event', self.on_press)
        self.cidrelease = self.rect.figure.canvas.mpl_connect(
            'button_release_event', self.on_release)
        self.cidmotion = self.rect.figure.canvas.mpl_connect(
            'motion_notify_event', self.on_motion)

    def on_press(self, event):
        'on button press we will see if the mouse is over us and store some data'
        if event.inaxes != self.rect.axes: return

        contains, attrd = self.rect.contains(event)
        if not contains: return
        self.press = True
        self.presset = set()

    def on_motion(self, event):
        'on motion we will move the rect if the mouse is over us'
        if not self.press: return
        x = int(event.xdata)
        y = int(event.ydata)
        p = (x,y)
        if p not in self.presset:
            self.presset.add(p)
            self.arr[y, x] = not self.arr[y, x]
            if sym != 'none':
                if sym == 'vert':
                    y = self.arr.shape[0] - 1 - y
                    x = x
                elif sym == 'hor':
                    y = y
                    x = self.arr.shape[1] - 1 - x
                elif sym == 'spiral':
                    y,x = x,y
                self.arr[y, x] = not self.arr[y, x]

            self.rect.set_data(self.arr)

        self.rect.figure.canvas.draw()

    def on_release(self, event):
        'on release we reset the press data'
        self.press = False
        self.rect.figure.canvas.draw()

    def disconnect(self):
        'disconnect all the stored connection ids'
        self.rect.figure.canvas.mpl_disconnect(self.cidpress)
        self.rect.figure.canvas.mpl_disconnect(self.cidrelease)
        self.rect.figure.canvas.mpl_disconnect(self.cidmotion)

if len(sys.argv) < 4:
    print('usage: hedgedraw.py width height [vert|hor|spiral|none]')
    sys.exit(1)

w = int(sys.argv[1])
h = int(sys.argv[2])
sym = sys.argv[3]

fig = plt.figure()
ax = fig.add_subplot(111)
arr = np.zeros((w,h))
im = ax.imshow(arr, vmin=0, vmax=1)
q = DraggableRectangle(im, arr)
q.connect()

plt.show()

'''
    id: EntityID;
    type: EntityType;
    location: Location;
    hp: number;
    teamID: TeamID;
    cooldownEnd?: number;
    heldBy?: EntityID;
    holding?: EntityID;
    holdingEnd?: number;
'''

import json
j = 1000
for x in range(w):
    for y in range(h):
        print(json.dumps({
            'id': j,
            'type': 'hedge',
            'location': {'x': x, 'y': y},
            'hp': 10,
            'teamID': 0
        })+',')
        j+=1
