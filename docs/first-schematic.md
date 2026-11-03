# Draw your first schematic

Connect two resistors on a blank page, save the drawing as an editable Drawic
project, and export an SVG you can open in a browser.

Use the Drawic desktop app for this exercise. Get a package for your platform
from [Drawic releases](https://github.com/CanvasQAQ/drawic/releases), or
[build and start Drawic from source](../README.md#development).

## Place two resistors

1. Open Drawic on a blank page. If you already have a project open, choose
   **New** on the toolbar and save your current work if prompted.
2. In **Device library** on the left (expand **Devices** if it is collapsed),
   type `resistor` in **Search symbols** and select **Resistor**.
3. Click near the middle of the page to place the first resistor. Click again
   directly below it, leaving space between the two symbols. Press **Esc** to
   finish placing devices.

On a fresh page, the upper resistor is labeled **R1** and the lower one **R2**.

## Connect the facing pins

1. Select **Wire** on the toolbar to reveal the pins.
2. Click the bottom pin of **R1**. Move the pointer toward the top pin of **R2**
   to see the wire preview, then click that pin to finish the connection.
3. Choose **Select** and drag **R2** a little to one side. Both ends of the wire
   should stay attached as its path changes. Choose **Undo** to return **R2**
   to its original position.

## Save the project and export the page

1. Select **Save** on the toolbar. Choose a folder and save the project as
   `first-schematic.drawic.json`. Use **Open** in Drawic to edit this file again.
2. Select **Export**. In **Export & tools**, select **SVG** (**Export vector**)
   and save the image as `first-schematic.svg` in the same folder.
3. Open `first-schematic.svg` in a browser. You should see both labeled
   resistors and the wire between them.

To learn how branches and wire crossings work, see the
[wire interaction model](WIRE_INTERACTION_MODEL.md#5-electrical-contact).
