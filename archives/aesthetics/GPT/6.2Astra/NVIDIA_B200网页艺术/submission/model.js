"use strict";
const Model = (() => {
  let canvas, ctx;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)),
    mix = (a, b, k) => a + (b - a) * k;
  let rndSeed = 2881;
  function rnd() {
    rndSeed = (Math.imul(rndSeed, 1664525) + 1013904223) >>> 0;
    return rndSeed / 4294967296;
  }
  function texture(w, h, paint) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d", { willReadFrequently: true }), w, h);
    return c;
  }
  function fill(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  }
  function stroke(g, pts, color, width = 1) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  function noise(g, w, h, count) {
    for (let i = 0; i < count; i++)
      fill(
        g,
        rnd() * w,
        rnd() * h,
        rnd() * 2 + 1,
        1,
        rnd() > 0.5 ? "#ffffff18" : "#07170927",
      );
  }
  const substrate = texture(1100, 870, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#65816b");
    grad.addColorStop(0.4, "#365c46");
    grad.addColorStop(1, "#1b493b");
    fill(g, 0, 0, w, h, grad);
    for (let side = 0; side < 4; side++) {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate((Math.PI * side) / 2);
      let extent = side % 2 ? w / 2 : h / 2,
        span = side % 2 ? h : w;
      for (let j = 0; j < 155; j++) {
        let x = (j / 154 - 0.5) * (span - 65),
          d = 18 + rnd() * 57;
        stroke(
          g,
          [
            [x, extent - 7],
            [x, extent - d],
            [x * 0.78, extent - d - Math.abs(x) * 0.22],
            [x * 0.78, 50],
          ],
          j % 7 === 0 ? "#bcba7d80" : "#b5c39b66",
          1.4,
        );
        if (j % 2 === 0) {
          fill(g, x, extent - 18, 3, 5, "#c3c887");
          fill(g, x, extent - d, 3, 3, "#e6d5ad");
        }
      }
      for (let j = 0; j < 22; j++) {
        let x = (j / 21 - 0.5) * (span - 135);
        fill(g, x, extent - 40, 12, 6, "#0e221c");
        fill(g, x, extent - 41, 3, 5, "#d4c8a0");
        fill(g, x + 9, extent - 41, 3, 5, "#c8c7ac");
      }
      g.restore();
    }
    for (let k = 0; k < 4; k++) {
      let x = k % 2 ? w - 24 : 24,
        y = k > 1 ? h - 24 : 24;
      g.fillStyle = "#d5c697";
      g.beginPath();
      g.arc(x, y, 9, 0, 7);
      g.fill();
      g.fillStyle = "#35483b";
      g.beginPath();
      g.arc(x, y, 5.5, 0, 7);
      g.fill();
    }
    noise(g, w, h, 19000);
    g.fillStyle = "#c1ccae";
    g.font = "14px monospace";
    for (let i = 0; i < 16; i++)
      fill(g, 85 + i * 5, h - 58, 2 + (i % 3), 7, "#bac8a595");
  });
  const interposer = texture(1000, 760, (g, w, h) => {
    fill(g, 0, 0, w, h, "#b3afa0");
    for (let n = 0; n < 210; n++) {
      let x = n * 5;
      stroke(
        g,
        [
          [x, 0],
          [x, 70 + (n % 11) * 4],
          [x + 45, 130 + (n % 11) * 4],
          [x + 45, h - 65],
          [x + 75, h - 35],
          [x + 75, h],
        ],
        n % 3 ? "#d5d3bc" : "#817d66",
        1.3,
      );
    }
    for (let i = 0; i < 12500; i++) {
      let x = Math.floor(rnd() * 200) * 5,
        y = Math.floor(rnd() * 152) * 5;
      fill(g, x, y, 2, 2, "#f2e1b9");
    }
  });
  // Shared addresses of the authored floorplan, in die-mask texels and package units.
  const layout = {
    group(col, row) {
      return [16 + col * 146, 24 + row * 94, 138, 83];
    },
    unit(col, row, a, b) {
      const [x, y] = this.group(col, row);
      return [x + 3 + a * 33, y + 2 + b * 20, 30, 17];
    },
    cache(side, row) {
      return [side > 0 ? 334 : 40, 26 + row * 94, 29, 65];
    },
    memory(side, row) {
      return [side * 2.27, (row - 1.5) * 1.01];
    },
    die(side, u, v, z) {
      return [side * 0.825 + (u / 610 - 0.5) * 1.56, (v / 800 - 0.5) * 3.78, z];
    },
    bus(side, row, lane) {
      const y = this.memory(side, row)[1],
        v = (lane - 9.5) * 0.032;
      return [
        [side * 1.91, y + v],
        [side * 1.84, y + v],
        [side * 1.75, y + v],
        [side * 1.63, y + v * 0.75],
        [side * 1.56, y + v * 0.75],
      ];
    },
  };
  function silicon(variant) {
    return texture(610, 800, (g, w, h) => {
      fill(g, 0, 0, w, h, "#2d4645");
      let palette = [
        "#6d8c78",
        "#9ead8c",
        "#aaa37b",
        "#536e65",
        "#849e98",
        "#acb69a",
        "#6e8a91",
        "#b2a288",
      ];
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 4; col++) {
          const [x, y] = layout.group(col, row);
          fill(g, x, y, 138, 83, palette[(row * 3 + col + variant) % 8]);
          for (let a = 0; a < 4; a++)
            for (let b = 0; b < 4; b++) {
              const [bx, by] = layout.unit(col, row, a, b);
              fill(g, bx, by, 30, 17, palette[Math.floor(rnd() * 8)]);
              for (let n = 0; n < 6; n++)
                fill(g, bx + n * 5, by, 1, 16, "#354e4a8c");
              fill(g, bx, by + 10, 29, 1, "#d7d8b7");
            }
          fill(g, x + 2, y + 74, 133, 7, "#647264");
          for (let s = 0; s < 32; s++)
            fill(g, x + 2 + s * 4, y + 75, 2, 5, "#b2ad88");
        }
      for (let r = 0; r < 8; r++) {
        let by = 26 + r * 94;
        for (let v = 0; v < 2; v++) {
          let bx = 40 + v * 294;
          fill(g, bx, by, 29, 65, "#3f5a52");
          for (let i = 0; i < 17; i++)
            fill(
              g,
              bx + 2,
              by + i * 3.8,
              25,
              1.9,
              i % 4 ? "#668076" : "#a5b49a",
            );
        }
      }
      for (let j = 0; j < 3; j++) {
        let by = 184 + j * 200;
        fill(g, 20, by, 565, 10, "#5c7367");
        for (let i = 0; i < 90; i++)
          fill(g, 23 + i * 6.1, by + 1, 3, 7, i % 4 ? "#93a38a" : "#b6aa84");
      }
      for (let n = 0; n < 90; n++) {
        let x = rnd() * w;
        stroke(
          g,
          [
            [x, 0],
            [x, 10],
            [x + 10, 20],
          ],
          "#d3c59b",
          1,
        );
      }
      for (let y = 0; y < h; y += 6) {
        fill(g, 0, y, 9, 3, "#d6c596");
        fill(g, w - 8, y, 7, 3, "#d6c596");
      }
      for (let y = 0; y < h; y += 11) {
        fill(g, 288, y, 15, 7, "#ceb892");
        fill(g, 296, y, 9, 4, "#7e827c");
      }
      noise(g, w, h, 22000);
      let grad = g.createLinearGradient(0, h, w, 0);
      grad.addColorStop(0, "#75677b55");
      grad.addColorStop(0.48, "#bfd9c908");
      grad.addColorStop(1, "#dee3bd55");
      fill(g, 0, 0, w, h, grad);
    });
  }
  const dies = [silicon(0), silicon(4)];
  const hbm = texture(176, 175, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, "#4b514a");
    gr.addColorStop(1, "#262f2c");
    fill(g, 0, 0, w, h, gr);
    noise(g, w, h, 3500);
    g.strokeStyle = "#8c8e7b";
    g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = "#c3c5b2";
    g.font = "bold 19px monospace";
    for (let n = 0; n < 4; n++)
      stroke(
        g,
        [
          [15, 50 + n * 5],
          [30, 44 + n * 5],
          [43, 50 + n * 5],
        ],
        "#acb8a3",
        1.6,
      );
    g.font = "10px monospace";

    for (let i = 0; i < 20; i++)
      fill(g, 17 + i * 3, 119, 1 + (i % 3 === 0), 11, "#8a9380");
    fill(g, 14, 15, 6, 6, "#c9b88c");
  });
  // Brushed metal, intake grilles and backplane looms are generated at inspection resolution.
  const metal = texture(420, 360, (g, w, h) => {
    fill(g, 0, 0, w, h, "#58635a");
    for (let y = 0; y < h; y += 3) fill(g, 0, y, w, 1, "#a6afa128");
    g.strokeStyle = "#abb3a4";
    g.strokeRect(10, 10, w - 20, h - 20);
    for (let i = 0; i < 4; i++) {
      fill(g, i % 2 ? w - 21 : 17, i < 2 ? 16 : h - 21, 6, 6, "#262e29");
    }
    for (let i = 0; i < 43; i++) fill(g, 53 + i * 7, 52, 3, h - 104, "#313e35");
  });
  const rackSide = texture(280, 630, (g, w, h) => {
    fill(g, 0, 0, w, h, "#414b44");
    for (let i = 0; i < 3; i++) {
      fill(g, 11 + i * 88, 10, 83, 610, "#59655c");
      fill(g, 14 + i * 88, 15, 1, 597, "#909b8d");
      for (let j = 0; j < 35; j++)
        fill(g, 18 + i * 88, 402 + j * 4, 66, 1, "#39443b");
    }
    noise(g, w, h, 3200);
  });
  const trayFace = [0, 1, 2].map((f) =>
    texture(640, 100, (g, w, h) => {
      let gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#a8ada4");
      gr.addColorStop(0.27, f === 1 ? "#a28c71" : "#818c82");
      gr.addColorStop(1, "#526057");
      fill(g, 0, 0, w, h, gr);
      for (let i = 0; i < 4; i++) {
        let x = 43 + i * 144;
        fill(g, x, 10, 136, 73, "#344039");
        for (let j = 0; j < 11; j++)
          for (let u = 0; u < 7; u++) {
            fill(g, x + 4 + j * 11, 14 + u * 9, 6, 4, "#15251e");
            fill(g, x + 4 + j * 11, 18 + u * 9, 6, 1, "#76887b");
          }
        fill(g, x + 9, 66, 36, 9, "#c5c8b8");
        fill(g, x + 60, 62, 18, 10, "#1b271f");
        fill(g, x + 90, 62, 18, 10, "#1b271f");
        fill(g, x + 118, 61, 4, 9, "#d0d2ac");
      }
      for (let x of [8, 612]) {
        fill(g, x, 12, 22, 70, "#353e35");
        fill(g, x + 4, 19, 14, 43, f === 1 ? "#d9945c" : "#c5c6ae");
        fill(g, x + 3, 72, 10, 4, "#a5c37e");
      }
      fill(g, 0, 92, w, 6, "#25342b");
    }),
  );
  const back = texture(360, 700, (g, w, h) => {
    fill(g, 0, 0, w, h, "#263c32");
    for (let j = 0; j < 32; j++) {
      let x = 14 + j * 10;
      stroke(
        g,
        [
          [x, 10],
          [x, 64],
          [x + (j % 4) * 4, 78],
          [x + (j % 4) * 4, h - 72],
          [x, h - 54],
          [x, h - 12],
        ],
        j % 3 ? "#a77b4f" : "#c99b69",
        3,
      );
    }
  });
  const switchLid = texture(250, 140, (g, w, h) => {
    fill(g, 0, 0, w, h, "#38473e");
    g.strokeStyle = "#a2aa96";
    g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = "#c5cebb";
    g.font = "bold 29px monospace";
    g.fillText("NVSwitch", 17, 75);
    noise(g, w, h, 1100);
  });
  const graceLid = texture(270, 275, (g, w, h) => {
    fill(g, 0, 0, w, h, "#acb5a5");
    for (let y = 0; y < h; y += 2) fill(g, 0, y, w, 1, "#e3e6d32a");
    g.fillStyle = "#4a594a";
    g.font = "bold 36px monospace";
    g.fillText("GRACE", 36, 135);
    g.font = "17px monospace";

    noise(g, w, h, 800);
  });
  const coldPlate = texture(320, 460, (g, w, h) => {
    const copper = g.createLinearGradient(0, 0, w, h);
    copper.addColorStop(0, "#966446");
    copper.addColorStop(0.38, "#deb38a");
    copper.addColorStop(0.72, "#b87b53");
    copper.addColorStop(1, "#e0ba90");
    fill(g, 0, 0, w, h, copper);
    for (let i = 0; i < 7; i++) {
      const x = 20 + i * 8,
        y = 24 + i * 8;
      g.strokeStyle = i % 2 ? "#ce9d73" : "#9c6b4e";
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x, y, w - 2 * x, h - 2 * y, 15);
      g.stroke();
    }
    for (const x of [23, w - 23])
      for (const y of [22, h - 22]) {
        g.fillStyle = "#5a5c4d";
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.fill();
        stroke(
          g,
          [
            [x - 4, y - 2],
            [x + 4, y + 2],
          ],
          "#c7c8b2",
          2,
        );
      }
    noise(g, w, h, 4800);
    g.fillStyle = "#704f3a";
    g.font = "bold 16px monospace";
    for (let i = 0; i < 3; i++)
      stroke(
        g,
        [
          [116 + i * 10, 227],
          [142 + i * 10, 204],
          [169 + i * 10, 227],
        ],
        "#926a4b",
        2,
      );
    g.font = "12px monospace";
  });
  // Distant racks use one continuous front surface. Its slot spacing is the same
  // as the separable trays on the inspection rack.
  const roomFront = texture(256, 672, (g, w, h) => {
    fill(g, 0, 0, w, h, "#344638");
    const panel = (z, height, switching) => {
      const y = ((5.08 - z - height) * h) / 4.88,
        ht = (height * h) / 4.88;
      fill(g, 7, y, w - 14, ht, switching ? "#98866d" : "#8e9c8e");
      fill(
        g,
        7,
        y + ht * 0.75,
        w - 14,
        ht * 0.25,
        switching ? "#6e705f" : "#526458",
      );
      for (let j = 0; j < 4; j++) {
        const x = 18 + j * 57;
        fill(g, x, y + 3, 49, ht * 0.55, "#34473c");
        for (let i = 0; i < 6; i++)
          fill(g, x + 4 + i * 7, y + 4, 3, ht * 0.34, "#536458");
      }
      fill(g, 9, y + 2, 4, ht - 5, switching ? "#d8a779" : "#c4c3a5");
      fill(g, w - 17, y + 3, 4, 3, "#a9c29a");
    };
    for (let j = 0; j < 27; j++)
      panel(0.29 + j * 0.165, 0.148, j >= 9 && j < 18);
    panel(4.79, 0.24, false);
    for (const x of [1, w - 5]) fill(g, x, 5, 4, h - 10, "#7d8d7e");
  });
  const roomBack = texture(520, 1160, (g, w, h) => {
    fill(g, 0, 0, w, h, "#36483e");
    for (let j = 0; j < 4; j++) {
      const x = 59 + j * 100;
      g.drawImage(back, x, 72, 83, h - 150);
      for (let m = 0; m < 9; m++)
        fill(g, x - 1, 72 + m * 112, 86, 6, "#899780");
    }
    fill(g, 16, 51, 14, h - 96, "#83aaa2");
    fill(g, w - 28, 51, 14, h - 96, "#bd8764");
    fill(g, w - 51, 68, 12, h - 137, "#ad955c");
  });
  // Registered pads and lateral memory buses use the same package coordinates
  // as the two dies and eight stacks sitting above the interposer.
  const landingMap = texture(1200, 910, (g, w, h) => {
    g.drawImage(interposer, 0, 0, w, h);
    const px = (x) => (x / 5.87 + 0.5) * w,
      py = (y) => (y / 4.43 + 0.5) * h;
    const landing = (cx, cy, ww, dd, nx, ny) => {
      const x = px(cx - ww / 2),
        y = py(cy - dd / 2),
        pw = (ww * w) / 5.87,
        ph = (dd * h) / 4.43;
      fill(g, x, y, pw, ph, "#879184");
      g.strokeStyle = "#e0d4b0";
      g.lineWidth = 2;
      g.strokeRect(x, y, pw, ph);
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const u = x + ((i + 0.5) * pw) / nx,
            v = y + ((j + 0.5) * ph) / ny;
          fill(g, u - 2.4, v - 2.4, 4.8, 4.8, "#5c695e");
          fill(g, u - 1.7, v - 1.8, 3.4, 3.1, "#d8c79c");
        }
    };
    for (const side of [-1, 1]) {
      landing(side * 0.825, 0, 1.52, 3.72, 25, 62);
      for (let row = 0; row < 4; row++) {
        const y = (row - 1.5) * 1.01;
        landing(side * 2.27, y, 0.89, 0.84, 16, 15);
        for (let j = 0; j < 20; j++) {
          stroke(
            g,
            layout.bus(side, row, j).map(([x, y]) => [px(x), py(y)]),
            j % 4 ? "#b39672" : "#786f56",
            1.6,
          );
        }
      }
    }
    for (let j = 0; j < 70; j++)
      stroke(
        g,
        [
          [px(-0.1), py((j - 34.5) * 0.05)],
          [px(0.1), py((j - 34.5) * 0.05)],
        ],
        "#a9855d",
        2,
      );
  });
  const laminate = texture(640, 48, (g, w, h) => {
    fill(g, 0, 0, w, h, "#314e3e");
    for (let j = 0; j < 5; j++) {
      fill(g, 0, j * 10 + 2, w, 2, "#a59164");
      for (let i = 0; i < 9; i++)
        fill(g, 10 + i * 72 + (j % 3) * 9, j * 10 + 1, 27, 3, "#54745d");
    }
    for (let i = 0; i < 15; i++) fill(g, i * 44 + 8, 1.5, 2, h - 3, "#cab88a");
  });
  const memorySlice = texture(256, 236, (g, w, h) => {
    fill(g, 0, 0, w, h, "#6c8276");
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const x = 8 + i * 61,
          y = 8 + j * 55;
        fill(g, x, y, 54, 46, (i + j) % 3 ? "#8e9e8a" : "#a4ab8b");
        for (let n = 0; n < 11; n++)
          fill(g, x + 2 + n * 4.6, y + 2, 1.5, 42, "#546d60");
        for (let n = 0; n < 3; n++)
          fill(g, x, y + 7 + n * 13, 54, 1, "#ccd0b1");
      }
    for (let j = 0; j < 12; j++)
      for (let i = 0; i < 3; i++) {
        const x = 120 + i * 6,
          y = 10 + j * 19;
        fill(g, x - 2, y - 2, 5, 5, "#536456");
        fill(g, x - 1.5, y - 1.5, 3, 3, "#e0b576");
      }
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const x = (0.5 + (sx * 0.36) / 0.96) * w,
          y = (0.5 + (sy * 0.31) / 0.88) * h;
        g.fillStyle = "#475b4c";
        g.fillRect(x - 5, y - 5, 10, 10);
        g.fillStyle = "#ddbb85";
        g.beginPath();
        g.arc(x, y, 3.9, 0, 2 * Math.PI);
        g.fill();
      }
  });
  const sectionSide = texture(320, 38, (g, w, h) => {
    fill(g, 0, 0, w, h, "#536558");
    fill(g, 0, 0, w, 3, "#a1b098");
    fill(g, 0, h - 6, w, 5, "#ad926d");
    for (let i = 0; i < 14; i++) {
      fill(g, 8 + i * 23, 3, 3, h - 9, "#c4a479");
      fill(g, 7 + i * 23, h - 8, 5, 4, "#e1cc95");
    }
  });
  const stackEdge = texture(320, 176, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const y = (i * h) / 8;
      g.drawImage(sectionSide, 0, y, w, h / 8 - 2);
      fill(g, 0, y + h / 8 - 2, w, 2, "#354a3c");
    }
  });
  const stackSkin = {
    top: hbm,
    front: stackEdge,
    back: stackEdge,
    side: stackEdge,
  };
  const substrateSkin = {
    top: substrate,
    side: laminate,
    front: laminate,
    back: laminate,
  };
  const sliceSkin = {
    top: memorySlice,
    side: sectionSide,
    front: sectionSide,
    back: sectionSide,
  };
  const modelCache = new WeakMap();
  let W,
    H,
    k,
    ox,
    oy,
    ang,
    elev,
    objects = [];
  const project = (x, y, z) => [
    ox + k * (Math.cos(ang) * x - Math.sin(ang) * y),
    oy +
      k *
        ((Math.sin(ang) * x + Math.cos(ang) * y) * Math.sin(elev) -
          z * Math.cos(elev)),
  ];
  function polygon(points, color, edge) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 0.62;
      ctx.stroke();
    }
  }
  function dark(hex, f) {
    let n = parseInt(hex.slice(1), 16);
    return (
      "rgb(" +
      [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * f)).join(",") +
      ")"
    );
  }
  function box(x, y, z, w, d, h, c, tex, bev = 0.035) {
    objects.push({ x, y, z, w, d, h, c, tex, bev });
  }
  function paintBox(o) {
    const { x, y, z, w, d, h, c, tex } = o,
      l = x - w / 2,
      r = x + w / 2,
      b = y - d / 2,
      f = y + d / 2,
      v = Math.min(o.bev, w * 0.1, d * 0.1),
      pts = [
        [l + v, b],
        [r - v, b],
        [r, b + v],
        [r, f - v],
        [r - v, f],
        [l + v, f],
        [l, f - v],
        [l, b + v],
      ],
      top = pts.map((p) => project(...p, z + h)),
      bot = pts.map((p) => project(...p, z));
    let surface = (image, a, b, d) => {
      ctx.save();
      ctx.transform(
        (b[0] - a[0]) / image.width,
        (b[1] - a[1]) / image.width,
        (d[0] - a[0]) / image.height,
        (d[1] - a[1]) / image.height,
        ...a,
      );
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    };
    for (let j = 0; j < 8; j++) {
      let i = (j + 1) % 8,
        dx = pts[i][0] - pts[j][0],
        dy = pts[i][1] - pts[j][1];
      if (dy * Math.sin(ang) - dx * Math.cos(ang) > 0) {
        polygon(
          [top[j], top[i], bot[i], bot[j]],
          dark(c, 0.52 + 0.28 * (j / 8)),
          "#24332640",
        );
        if (tex?.top) {
          let im =
            j === 4
              ? tex.front
              : j === 0
                ? tex.back
                : j === 2 || j === 6
                  ? tex.side
                  : null;
          if (im) surface(im, top[i], top[j], bot[i]);
        }
      }
    }
    polygon(top, c, "#d6d7be80");
    if (tex) {
      let img = tex.top || tex;
      let p = project(l, b, z + h),
        q = project(r, b, z + h),
        s = project(l, f, z + h);
      ctx.save();
      ctx.clip();
      ctx.transform(
        (q[0] - p[0]) / img.width,
        (q[1] - p[1]) / img.width,
        (s[0] - p[0]) / img.height,
        (s[1] - p[1]) / img.height,
        ...p,
      );
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      if (o.part === "die" && dies.includes(img)) {
        const ends = [project(l, b, z + h), project(r, f, z + h)];
        const sheen = ctx.createLinearGradient(...ends[0], ...ends[1]);
        const peak =
          0.42 +
          0.24 *
            Math.sin(
              ang * 1.6 + elev * 0.45 + (img === dies[0] ? -0.22 : 0.22),
            );
        sheen.addColorStop(0, "#668a8836");
        sheen.addColorStop(Math.max(0.01, peak - 0.24), "#ccd4b500");
        sheen.addColorStop(peak, "#ebd3a938");
        sheen.addColorStop(Math.min(0.99, peak + 0.26), "#92b6b813");
        sheen.addColorStop(1, "#7b73982b");
        ctx.save();
        ctx.clip();
        ctx.fillStyle = sheen;
        const xs = top.map((p) => p[0]),
          ys = top.map((p) => p[1]);
        ctx.fillRect(
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
        );
        ctx.restore();
      }
      ctx.strokeStyle = "#d4d4b891";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }
  function shadow(width, depth, z, opacity) {
    let p = project(0, 0, z);
    ctx.save();
    ctx.translate(...p);
    ctx.scale(width * k, depth * k);
    let gr = ctx.createRadialGradient(0, 0, 0.01, 0, 0, 1);
    gr.addColorStop(0, "rgba(33,44,32," + opacity + ")");
    gr.addColorStop(0.63, "rgba(33,44,32," + opacity * 0.45 + ")");
    gr.addColorStop(1, "#24332600");
    ctx.fillStyle = gr;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  function packageLayers(spread) {
    const interposerZ = 0.285 + 1.14 * spread;
    const deviceZ = interposerZ + 0.157 + 0.93 * spread;
    const open = clamp((spread - 0.4) / 0.6, 0, 1);
    const step = 0.025 + 0.185 * open * open * (3 - 2 * open);
    return {
      interposerZ,
      deviceZ,
      dieTop: deviceZ + 0.135,
      step,
      stackTop: deviceZ + 0.061 + 7 * step + 0.023,
    };
  }
  function fitPackage(spread) {
    const ca = Math.cos(ang),
      sa = Math.sin(ang),
      se = Math.sin(elev),
      ce = Math.cos(elev);
    let minY = Infinity,
      maxY = -Infinity,
      maxX = 0;
    for (const o of objects) {
      const depth = o.x * sa + o.y * ca,
        extent = (Math.abs(sa) * o.w + Math.abs(ca) * o.d) / 2;
      minY = Math.min(minY, (depth - extent) * se - (o.z + o.h) * ce);
      maxY = Math.max(maxY, (depth + extent) * se - o.z * ce);
      maxX = Math.max(
        maxX,
        Math.abs(o.x * ca - o.y * sa) +
          (Math.abs(ca) * o.w + Math.abs(sa) * o.d) / 2,
      );
    }
    k = Math.min(k * 1.04, (W * 0.438) / maxX, (H * 0.85) / (maxY - minY));
    oy = clamp(
      H * 0.59 + k * (spread - 0.35) * 0.56,
      H * 0.065 - minY * k,
      H * 0.915 - maxY * k,
    );
  }
  function packageScene(layers) {
    const { interposerZ: mz, deviceZ: dz, step } = layers;
    const part = (name, ...args) => {
      box(...args);
      objects.at(-1).part = name;
    };
    part("substrate", 0, 0, 0, 6.65, 5.1, 0.12, "#405b45", substrateSkin, 0.12);
    part("substrate", 0, 0, 0.12, 6.6, 5.05, 0.035, "#aab58a", null, 0.1);
    part(
      "substrate",
      0,
      0,
      0.155,
      6.57,
      5.02,
      0.075,
      "#52765c",
      substrateSkin,
      0.1,
    );
    part("interposer", 0, 0, mz, 5.94, 4.48, 0.07, "#9b967f", interposer, 0.08);
    part(
      "interposer",
      0,
      0,
      mz + 0.07,
      5.87,
      4.43,
      0.065,
      "#d3cbb5",
      landingMap,
      0.07,
    );
    for (let j = 0; j < 38; j++)
      for (const side of [-1, 1])
        part(
          "bump",
          -2.74 + j * 0.148,
          side * 2.06,
          mz - 0.055,
          0.065,
          0.06,
          0.054,
          "#b6a47c",
          null,
          0.018,
        );
    for (let j = 0; j < 26; j++)
      for (const side of [-1, 1])
        part(
          "bump",
          side * 2.8,
          -1.94 + j * 0.15,
          mz - 0.055,
          0.06,
          0.066,
          0.054,
          "#b6a47c",
          null,
          0.018,
        );
    for (let i = 0; i < 2; i++) {
      const x = i ? 0.825 : -0.825;
      for (let j = 0; j < 15; j++)
        for (const side of [-1, 1])
          part(
            "microbump",
            x + side * 0.71,
            (j - 7) * 0.247,
            dz - 0.022,
            0.037,
            0.046,
            0.022,
            "#bfa378",
            null,
            0.009,
          );
      part("die", x, 0, dz, 1.61, 3.83, 0.085, "#434942");
      part("die", x, 0, dz + 0.085, 1.56, 3.78, 0.05, "#a7a89a", dies[i]);
    }
    for (const side of [-1, 1])
      for (let j = 0; j < 4; j++) {
        const [x, y] = layout.memory(side, j),
          opened = side === 1 && j === 3;
        for (const dx of [-0.32, 0, 0.32])
          for (const dy of [-0.3, 0.3])
            part(
              "microbump",
              x + dx,
              y + dy,
              dz - 0.022,
              0.043,
              0.044,
              0.022,
              "#c6ac81",
              null,
              0.01,
            );
        part(
          "memory",
          x,
          y,
          dz,
          0.98,
          0.9,
          0.054,
          "#5c6857",
          memorySlice,
          0.022,
        );
        if (!opened || step <= 0.02500001) {
          // Bonded slices share a single external surface until their gaps open.
          part(
            "memory",
            x,
            y,
            dz + 0.061,
            0.96,
            0.88,
            0.198,
            "#657565",
            stackSkin,
            0.02,
          );
          continue;
        }
        for (let layer = 0; layer < 8; layer++) {
          const z = dz + 0.061 + layer * (opened ? step : 0.025);
          part(
            "memory",
            x,
            y,
            z,
            0.96,
            0.88,
            0.023,
            "#657565",
            layer === 7 ? hbm : sliceSkin,
            0.02,
          );
          if (opened && layer < 7 && step > 0.035) {
            for (const xx of [-0.36, 0.36])
              for (const yy of [-0.31, 0.31])
                part(
                  "microbump",
                  x + xx,
                  y + yy,
                  z + 0.023,
                  0.045,
                  0.045,
                  0.016,
                  "#c8a577",
                  null,
                  0.014,
                );
          }
        }
      }
  }
  function packageGuides(layers) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    for (const x of [-2.74, 2.74])
      for (const y of [-2.05, 2.05]) {
        stroke(
          ctx,
          [project(x, y, 0.24), project(x, y, layers.deviceZ)],
          "#7c8c797d",
          1,
        );
      }
    if (layers.step > 0.04) {
      ctx.setLineDash([2.5, 4]);
      for (const xx of [-0.36, 0.36])
        for (const yy of [-0.31, 0.31]) {
          const x = 2.27 + xx,
            y = 1.515 + yy;
          stroke(
            ctx,
            [
              project(x, y, layers.deviceZ + 0.05),
              project(x, y, layers.stackTop),
            ],
            "#a27f5480",
            0.85,
          );
        }
    }
    ctx.restore();
  }
  function deviceShadows(layers) {
    const z = layers.interposerZ + 0.136,
      p = project(0, 0, z),
      x = project(1, 0, z),
      y = project(0, 1, z);
    const distance = layers.deviceZ - z,
      offset = 0.05 + Math.min(0.22, distance * 0.17);
    ctx.save();
    ctx.transform(x[0] - p[0], x[1] - p[1], y[0] - p[0], y[1] - p[1], ...p);
    ctx.beginPath();
    ctx.roundRect(-2.935, -2.215, 5.87, 4.43, 0.07);
    ctx.clip();
    const shade = (cx, cy, w, d) => {
      for (let j = 2; j >= 0; j--) {
        const blur = (0.025 + distance * 0.06) * j;
        ctx.fillStyle = j ? "#23382b0c" : "#23382b1f";
        ctx.beginPath();
        ctx.roundRect(
          cx - w / 2 + offset - blur,
          cy - d / 2 + offset * 0.65 - blur,
          w + 2 * blur,
          d + 2 * blur,
          0.04 + blur,
        );
        ctx.fill();
      }
    };
    for (const side of [-1, 1]) {
      shade(side * 0.825, 0, 1.61, 3.83);
      for (let j = 0; j < 4; j++)
        shade(side * 2.27, (j - 1.5) * 1.01, 0.98, 0.9);
    }
    ctx.restore();
  }
  function paintPackagePart(o, layers) {
    if (o.tex === interposer && o.z === layers.interposerZ) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      polygon(
        [
          [-2.96, -2.23],
          [2.96, -2.23],
          [2.96, 2.23],
          [-2.96, 2.23],
        ].map(([x, y]) => project(x + 0.13, y + 0.13, 0.234)),
        "#172d20",
      );
      ctx.restore();
    }
    paintBox(o);
    if (o.tex === landingMap) deviceShadows(layers);
  }
  function gpuPackage(x, y, z, width, depth, scale = 1) {
    // The same two-die and eight-stack layout remains visible at board scale.
    const b = (dx, dy, dz, w, d, h, color, tex) =>
      box(
        x + dx * width,
        y + dy * depth,
        z + dz * scale,
        w * width,
        d * depth,
        h * scale,
        color,
        tex,
        0.015 * scale,
      );
    b(0, 0, 0, 1, 1, 0.07, "#476751", substrate);
    b(0, 0, 0.07, 0.91, 0.88, 0.036, "#a9ab97", interposer);
    for (let i = 0; i < 2; i++)
      b((i - 0.5) * 0.255, 0, 0.107, 0.243, 0.73, 0.059, "#778c79", dies[i]);
    for (const side of [-1, 1])
      for (let j = 0; j < 4; j++)
        b(
          side * 0.359,
          (j - 1.5) * 0.184,
          0.108,
          0.141,
          0.163,
          0.07,
          "#475347",
          hbm,
        );
  }
  function hgxBoard() {
    box(0, 0, 0, 7.2, 4.7, 0.23, "#445b48", substrate, 0.12);
    for (let j = 0; j < 8; j++)
      gpuPackage(
        ((j % 4) - 1.5) * 1.62,
        (j < 4 ? -1 : 1) * 1.42,
        0.24,
        1.48,
        1.55,
      );
    for (const x of [-0.69, 0.69])
      box(x, 0, 0.24, 1.13, 0.63, 0.15, "#4d5750", switchLid);
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++)
        box(
          side * 3.47,
          (i - 1.5) * 0.94,
          0.24,
          0.17,
          0.7,
          0.14,
          "#7c8a77",
          metal,
        );
  }
  function graceBoard(cx, cy, z, scale) {
    const b = (x, y, h, w, d, t, color, tex) =>
      box(
        cx + x * scale,
        cy + y * scale,
        z + h * scale,
        w * scale,
        d * scale,
        t * scale,
        color,
        tex,
        0.025 * scale,
      );
    b(0, 0, 0, 5.34, 3.42, 0.15, "#4a6b54", substrate);
    b(-1.24, 0, 0.15, 1.59, 1.74, 0.09, "#879880");
    b(-1.24, 0, 0.24, 1.39, 1.5, 0.17, "#aab6a4", graceLid);
    for (const sign of [-1, 1]) {
      gpuPackage(
        cx + 1.04 * scale,
        cy + sign * 0.78 * scale,
        z + 0.16 * scale,
        1.85 * scale,
        1.36 * scale,
        scale,
      );
      for (let n = 0; n < 5; n++)
        b(-2 + n * 0.41, sign * 1.18, 0.16, 0.32, 0.35, 0.11, "#48564b");
      // C2C fan-out is etched on the board between CPU and GPU packages.
      for (let lane = 0; lane < 6; lane++)
        b(
          -0.21,
          sign * (0.34 + lane * 0.055),
          0.153,
          0.43,
          0.02,
          0.014,
          "#b19e71",
        );
    }
    for (let j = 0; j < 6; j++)
      b(-2.47, (j - 2.5) * 0.35, 0.16, 0.14, 0.22, 0.13, "#acb09c");
  }
  const trayWidth = 7.48,
    trayDepth = 4.48,
    trayModuleScale = 0.63;
  function trayShell() {
    box(0, 0, 0, trayWidth, trayDepth, 0.17, "#889486", metal);
    for (const side of [-1, 1]) {
      box(side * 3.68, 0, 0.17, 0.11, 4.44, 0.32, "#909f8e", metal);
      box(side * 3.24, 2.17, 0.19, 0.28, 0.27, 0.32, "#424f46");
      box(side * 3.24, 2.3, 0.44, 0.3, 0.27, 0.1, "#aab7a1");
    }
    box(0, 2.14, 0.13, 7.12, 0.18, 0.38, "#859083", {
      top: metal,
      front: trayFace[0],
      side: metal,
    });
    box(0, -2.12, 0.17, 7.17, 0.13, 0.26, "#849382", metal);
    for (let j = 0; j < 8; j++) {
      const x = (j - 3.5) * 0.78;
      box(x, -1.71, 0.18, 0.65, 0.51, 0.2, "#526458", connectorGrille);
      box(x, -1.99, 0.2, 0.5, 0.09, 0.12, "#bb9c69");
    }
    for (let j = 0; j < 5; j++)
      box((j - 2) * 1.34, 1.55, 0.18, 1.11, 0.5, 0.2, "#556459", metal);
  }
  const connectorGrille = texture(200, 112, (g, w, h) => {
    fill(g, 0, 0, w, h, "#606b60");
    for (let i = 0; i < 15; i++) fill(g, 8 + i * 12, 10, 5, h - 20, "#a9b09c");
  });
  function liquidPlate(cx, lift) {
    const x = cx + 1.04 * trayModuleScale,
      y = -0.1 - lift * 0.82,
      z = 0.42 + lift * 1.22;
    box(x, y, z, 1.34, 1.92, 0.12, "#b78661", coldPlate, 0.057);
    for (const sign of [-1, 1])
      box(
        x + sign * 0.4,
        y - 0.75,
        z + 0.12,
        0.2,
        0.18,
        0.14,
        sign < 0 ? "#75a6a0" : "#ac7656",
        null,
        0.05,
      );
  }
  function computeTray(lift = 0) {
    trayShell();
    for (const side of [-1, 1])
      graceBoard(side * 1.78, -0.1, 0.18, trayModuleScale);
    liquidPlate(-1.78, lift);
    liquidPlate(1.78, 0);
  }
  function shifted(distance, build) {
    // Slide along the camera's horizontal axis, even after the visitor rotates it.
    const start = objects.length,
      dx = distance * Math.cos(ang),
      dy = -distance * Math.sin(ang);
    build();
    for (let j = start; j < objects.length; j++) {
      objects[j].x += dx;
      objects[j].y += dy;
    }
  }
  function platformLayout(view) {
    const slide = clamp(view, 0, 1),
      assembly = clamp(view - 1, 0, 1),
      span = (W / k) * 1.15;
    return {
      hgx: -slide * span,
      gb: (1 - slide) * span,
      shell: (1 - assembly) * span,
      assembly,
      cx: -1.78 * assembly,
      cy: -0.1 * assembly,
      z: 0.18 * assembly,
      scale: mix(1.24, trayModuleScale, assembly),
    };
  }
  function stationPoint(shift, x, y, z) {
    return [x + Math.cos(ang) * shift, y - Math.sin(ang) * shift, z];
  }
  function platform(s) {
    const view = s.platformView,
      layout = platformLayout(view);
    if (view < 1) shifted(layout.hgx, hgxBoard);
    if (view > 0)
      shifted(layout.gb, () =>
        graceBoard(layout.cx, layout.cy, layout.z, layout.scale),
      );
    if (view > 1) {
      shifted(layout.shell, () => {
        trayShell();
        graceBoard(1.78, -0.1, 0.18, trayModuleScale);
        liquidPlate(1.78, 0);
        liquidPlate(-1.78, s.plateLift);
      });
    }
  }
  function drawerPosition(p, s, forest) {
    const u = clamp((p - 0.025) / 0.23, 0, 1);
    return (s.drawer >= 0 ? s.drawer : 1 - u * u * (3 - 2 * u)) * (1 - forest);
  }
  function rackDrawer(x, y, z, drawer) {
    const start = objects.length;
    computeTray(0);
    const scale = 1.73 / trayWidth,
      centerY = 0.88 - (trayDepth * scale) / 2 + drawer * 1.16;
    // Only the part past the front rail is visible. Clip the tray in its own
    // coordinate system so the exposed area grows continuously during extraction.
    const visible = [];
    for (const o of objects.splice(start)) {
      o.x = x + o.x * scale;
      o.y = y + centerY + o.y * scale;
      o.z = z + o.z * scale;
      o.w *= scale;
      o.h *= scale;
      o.d *= scale;
      o.bev *= scale;
      const rear = Math.max(o.y - o.d / 2, y + 0.79),
        front = o.y + o.d / 2;
      if (front <= rear) continue;
      o.y = (front + rear) / 2;
      o.d = front - rear;
      visible.push(o);
    }
    visible.sort(
      (a, b) =>
        a.z - b.z || (a.x - b.x) * Math.sin(ang) + (a.y - b.y) * Math.cos(ang),
    );
    objects.push(...visible);
    return centerY + (trayDepth * scale) / 2;
  }
  function rack(x, y, z, sc, detail, spread, drawer = 0) {
    const group = objects.length;
    let b = (dx, dy, dz, w, d, h, c, tex) =>
      box(
        x + dx * sc,
        y + dy * sc,
        z + dz * sc,
        w * sc,
        d * sc,
        h * sc,
        c,
        tex,
        0.013 * sc,
      );
    if (!detail) {
      b(0, 0, 0, 1.92, 1.75, 0.2, "#323e36", metal);
      b(0, 0, 0.2, 1.92, 1.71, 4.88, "#49574d", {
        top: metal,
        front: roomFront,
        back: roomBack,
        side: rackSide,
      });
      b(0, 0, 5.08, 1.92, 1.77, 0.12, "#66776a", metal);
      for (let n = group; n < objects.length; n++)
        objects[n].group = {
          x,
          y,
          order: n - group,
          roof: n === group + 2,
          rear: false,
        };
      return;
    }
    b(0, 0, 0, 1.92, 1.75, 0.2, "#323e36", metal);
    b(0, -0.04, 0.2, 1.92, 1.64, 4.88, "#49574d", {
      top: metal,
      front: back,
      back,
      side: rackSide,
    });
    for (let j = 0; j < 27; j++) {
      if (detail && j === 4 && drawer > 0.001) {
        rackDrawer(x, y, z + 0.29 + j * 0.165, drawer);
        continue;
      }
      let sw = j >= 9 && j < 18,
        off = sw ? spread * 0.31 : 0;
      b(
        0,
        0.78 + off * 0.5,
        0.29 + j * 0.165,
        1.73,
        0.19 + off,
        0.154,
        sw ? "#9d795b" : "#8b978a",
        { top: metal, front: trayFace[sw ? 1 : 0], side: metal },
      );
    }
    b(0, 0.79, 4.79, 1.73, 0.19, 0.24, "#7c897d", {
      top: metal,
      front: trayFace[2],
      side: metal,
    });
    b(0, 0, 5.08, 1.92, 1.77, 0.12, "#66776a", metal);
    const rearStart = objects.length;
    if (Math.cos(ang) < 0) {
      for (let j = 0; j < 4; j++) {
        const x = (j - 1.5) * 0.36;
        b(x, -0.906, 0.33, 0.29, 0.16, 4.32, "#765f47", {
          top: metal,
          back,
          side: rackSide,
        });
        for (let row = 0; row < 9; row++)
          b(x, -0.996, 0.42 + row * 0.48, 0.31, 0.04, 0.052, "#7f8b7a");
      }
      for (let side of [-1, 1]) {
        b(
          side * 0.84,
          -0.92,
          0.2,
          0.074,
          0.14,
          4.64,
          side < 0 ? "#6d9f99" : "#b07955",
        );
        for (let row = 0; row < 18; row++)
          b(
            side * 0.77,
            -0.945,
            0.39 + row * 0.25,
            0.14,
            0.11,
            0.052,
            side < 0 ? "#78aba5" : "#c09169",
          );
      }
      b(0.68, -0.929, 0.23, 0.081, 0.12, 4.56, "#bfa46d");
    }
    for (let n = group; n < objects.length; n++)
      objects[n].group = {
        x,
        y,
        order: n - group,
        roof: n === rearStart - 1,
        rear: n >= rearStart,
      };
  }
  function facilityFloor(amount) {
    if (amount <= 0) return;
    ctx.save();
    ctx.globalAlpha = amount;
    const ambient = ctx.createRadialGradient(
      W * 0.45,
      H * 0.5,
      0,
      W * 0.5,
      H * 0.5,
      W * 0.66,
    );
    ambient.addColorStop(0, "#31493f");
    ambient.addColorStop(0.6, "#20372e");
    ambient.addColorStop(1, "#162a24");
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, W, H);
    const ground = (x, y) => project(x, y, -0.1);
    for (let i = -18; i <= 18; i++) {
      stroke(
        ctx,
        [ground(i, -18), ground(i, 18)],
        i % 4 ? "#3a51451f" : "#73857537",
        1,
      );
      stroke(
        ctx,
        [ground(-18, i), ground(18, i)],
        i % 4 ? "#3a51451f" : "#73857537",
        1,
      );
    }
    // Two separate manifolds run along the aisles to the facility plant.
    for (let row = -1; row <= 1; row++) {
      const y = row * 3.2 + 1.25;
      for (let m = 0; m < 2; m++) {
        const color = m ? "#ba815b" : "#70aba4",
          offset = m * 0.17;
        const route = [
          ground(-6.75, y + offset),
          ground(5.55, y + offset),
          ground(6.1 + offset, y + 0.58),
          ground(6.1 + offset, 6.8),
        ];
        stroke(ctx, route, color + "30", Math.max(4, k * 0.13));
        stroke(ctx, route, color, Math.max(1, k * 0.031));
        for (let j = -2; j <= 2; j++) {
          let x = j * 2.42 + offset;
          stroke(
            ctx,
            [ground(x, y + offset), ground(x, y - 0.55)],
            color,
            Math.max(1, k * 0.025),
          );
        }
      }
    }
    // Copper busbars enter from the other side of each row.
    for (let j = -1; j <= 1; j++) {
      const y = j * 3.2 - 1.23;
      stroke(
        ctx,
        [
          ground(-8.5, -5.5),
          ground(-6.4, -5.5),
          ground(-6.4, y),
          ground(4.85, y),
        ],
        "#af975b",
        Math.max(1, k * 0.033),
      );
    }
    ctx.restore();
  }
  function forestAmount(p, s) {
    return s.forest >= 0 ? s.forest : clamp((p - 0.55) / 0.4, 0, 1);
  }
  function rackYaw(p, s) {
    if (s.rackBase !== null) return s.rackBase;
    const smooth = (x) => {
      x = clamp(x, 0, 1);
      return x * x * (3 - 2 * x);
    };
    return (
      0.58 +
      p * 0.31 +
      2.9 * (smooth((p - 0.2) / 0.16) - smooth((p - 0.47) / 0.18))
    );
  }
  function cableRoute() {
    return [
      [-0.3, -1.01, 1.1],
      [-0.2, -1.01, 1.22],
      [-0.2, -1.01, 2.39],
      [-0.3, -1.01, 2.52],
    ].map((pt) => project(...pt));
  }
  function rackScene(p, s) {
    let forest = forestAmount(p, s);
    let spread = clamp((p - 0.1) * 4, 0, 1);
    const drawer = drawerPosition(p, s, forest);
    rack(0, 0, 0, 1, true, spread, drawer);
    if (forest > 0.004) {
      for (let x = -2; x <= 2; x++)
        for (let y = -1; y <= 1; y++) {
          if (x || y) rack(x * 2.42, y * 3.2, 0, forest, false, 0);
        }
    }
  }
  function platformSignals(t, s) {
    const view = s.platformView,
      layout = platformLayout(view);
    if (view < 0.8) {
      const phase = (t * 0.16) % 1;
      for (let j = 0; j < 8; j++) {
        const x = ((j % 4) - 1.5) * 1.62,
          y = (j < 4 ? -1 : 1) * 1.42;
        const pts = [
          [j % 2 ? 0.69 : -0.69, 0, 0.405],
          [x, 0, 0.405],
          [x, y, 0.42],
        ].map((v) => project(...stationPoint(layout.hgx, ...v)));
        const forward = clamp((phase - j * 0.012) / 0.28, 0, 1),
          back = clamp((phase - 0.56 - j * 0.01) / 0.28, 0, 1),
          u = forward * (1 - back);
        stroke(ctx, pts, "#c18e5f", 1.1);
        const seg = u < 0.5 ? 0 : 1,
          v = u * 2 - seg;
        const xx = mix(pts[seg][0], pts[seg + 1][0], v),
          yy = mix(pts[seg][1], pts[seg + 1][1], v);
        const size = 2.6 + 2 * Math.sin(Math.PI * u);
        ctx.fillStyle = back > 0 ? "#ead899" : "#ed8b53";
        ctx.beginPath();
        ctx.arc(xx, yy, size, 0, 7);
        ctx.fill();
        if (phase > 0.34 && phase < 0.61) {
          const pulse = Math.sin(((phase - 0.34) / 0.27) * Math.PI);
          ctx.strokeStyle = "rgba(224,183,115," + pulse + ")";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(
            pts[2][0],
            pts[2][1],
            k * 0.52 * pulse,
            k * 0.25 * pulse,
            ang * 0.25,
            0,
            7,
          );
          ctx.stroke();
        }
      }
    } else if (view < 1.5) {
      for (const sign of [-1, 1]) {
        const pts = [
          [-0.55, sign * 0.38],
          [0.04, sign * 0.38],
          [0.2, sign * 0.63],
        ].map(([x, y]) =>
          project(
            ...stationPoint(
              layout.gb,
              layout.cx + x * layout.scale,
              layout.cy + y * layout.scale,
              layout.z + 0.23 * layout.scale,
            ),
          ),
        );
        stroke(ctx, pts, "#cc9569", 1.5);
        const u = (t * 0.55 + (sign > 0 ? 0.5 : 0)) % 1,
          seg = u < 0.5 ? 0 : 1,
          v = u * 2 - seg;
        ctx.fillStyle = "#f4cd97";
        ctx.beginPath();
        ctx.arc(
          mix(pts[seg][0], pts[seg + 1][0], v),
          mix(pts[seg][1], pts[seg + 1][1], v),
          3,
          0,
          7,
        );
        ctx.fill();
      }
    }
  }
  function draw(target, overlay, id, p, t, s) {
    canvas = target;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    if (!W || !H) return;
    let cw = Math.round(W * dpr),
      ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      modelCache.delete(canvas);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    objects = [];

    ang =
      s.angle +
      (id === 7 ? rackYaw(p, s) : 0.58 + (id === 0 ? p * 0.18 : p * 0.2));
    elev = clamp(0.51 + s.tilt + (id === 0 ? p * 0.09 : 0), 0.2, 1.3);
    ox = W * 0.5;
    oy = H * 0.57;
    k = Math.min(W / 10, H / 5.8);
    const forestLevel = id === 7 ? forestAmount(p, s) : 0;
    const layers = id === 0 ? packageLayers(s.explode) : null;
    let cache = modelCache.get(canvas),
      key = [
        cw,
        ch,
        W,
        H,
        dpr,
        s.zoom,
        p,
        s.angle,
        s.tilt,
        s.explode,
        s.platformView,
        s.plateLift,
        s.forest,
        s.drawer,
        s.rackBase,
      ].join("/");
    if (cache && cache.key === key) {
      // Geometry is retained on the base canvas while signals and the lens move.

      ox = cache.ox;
      oy = cache.oy;
      k = cache.k;
    } else {
      ctx.clearRect(0, 0, cw / dpr, ch / dpr);
      if (id === 0) {
        packageScene(layers);
        fitPackage(s.explode);
        k *= s.zoom;
        shadow(4.3, 1.78, -0.49, 0.31);
        packageGuides(layers);
      }
      if (id === 6) {
        oy = H * 0.53;
        k *= s.zoom;
        if (s.platformView === 0) {
          const q = clamp(p / 0.215, 0, 1),
            near = 1 - q * q * (3 - 2 * q);
          k *= 1 + 2.65 * near;
          const target = project(2.43, 1.42, 0.41);
          ox -= near * (target[0] - ox);
          oy -= near * (target[1] - oy);
        }
        const layout = platformLayout(s.platformView);
        const groundShadow = (shift, cx, cy, width, depth, opacity) => {
          const [x, y] = project(...stationPoint(shift, cx, cy, 0));
          ctx.save();
          ctx.translate(x - ox, y - oy);
          shadow(width, depth, -0.16, opacity);
          ctx.restore();
        };
        if (s.platformView < 1) groundShadow(layout.hgx, 0, 0, 4.2, 1.6, 0.28);
        if (s.platformView > 0 && layout.assembly < 1)
          groundShadow(
            layout.gb,
            layout.cx,
            layout.cy,
            3.25 * layout.scale,
            1.35 * layout.scale,
            0.28 * (1 - layout.assembly),
          );
        if (layout.assembly > 0)
          groundShadow(layout.shell, 0, 0, 4.5, 1.6, 0.27);
        platform(s);
      }
      if (id === 7) {
        let forest = forestAmount(p, s);
        k = Math.min(
          (W * 0.664) / (5.8 + forest * 14),
          H / (6.8 + forest * 6.8),
        );
        k *= s.zoom;
        ox = W * 0.61;
        oy = H * 0.54 + k * (1.9 - forest * 0.35);
        facilityFloor(forest);
        shadow(2 + 6 * forest, 1 + 3 * forest, 0, 0.28);
        rackScene(p, s);
      }
      // Parts with overlapping footprints follow physical height. Disjoint parts follow camera depth.
      objects.sort((a, b) => {
        if ((id === 0 || id === 6) && a.z !== b.z) return a.z - b.z;
        if (id === 7) {
          let da =
            (b.group.x - a.group.x) * Math.sin(ang) +
            (b.group.y - a.group.y) * Math.cos(ang);
          if (da) return -da;
          if (a.group.roof !== b.group.roof)
            return Number(a.group.roof) - Number(b.group.roof);
          if (a.group.rear !== b.group.rear)
            return Number(a.group.rear) - Number(b.group.rear);
          if (Math.cos(ang) < 0 && a.group.order !== 0 && b.group.order !== 0) {
            if (a.group.order === 1) return 1;
            if (b.group.order === 1) return -1;
          }
          return a.group.order - b.group.order;
        }
        let dx = b.x - a.x,
          dy = b.y - a.y,
          dist = dx * Math.sin(ang) + dy * Math.cos(ang);
        if (
          Math.abs(dx) < (a.w + b.w) / 2 - 0.0001 &&
          Math.abs(dy) < (a.d + b.d) / 2 - 0.0001
        )
          return a.z - b.z;
        return -dist;
      });
      if (id === 0) objects.forEach((o) => paintPackagePart(o, layers));
      else objects.forEach(paintBox);
      {
        cache = { key, ox, oy, k };
        modelCache.set(canvas, cache);
      }
    }
    if (overlay.width !== cw || overlay.height !== ch) {
      overlay.width = cw;
      overlay.height = ch;
    }
    ctx = overlay.getContext("2d", { willReadFrequently: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw / dpr, ch / dpr);
    if (id === 6) platformSignals(t, s);
    if (id === 7) {
      const f = forestLevel,
        rear = Math.cos(ang) < -0.12;
      // At room scale the focus moves to an actual foreground rack in the array.
      const nearX = Math.sin(ang) >= 0 ? 4.84 : -4.84,
        nearY = Math.cos(ang) >= 0 ? 3.2 : -3.2;
      const focus = clamp((f - 0.43) / 0.29, 0, 1);
      for (const [cx, cy, size, opacity] of [
        [0, 0, 1, 1 - focus],
        [nearX, nearY, f, focus],
      ]) {
        if (!opacity || !size) continue;
        ctx.save();
        ctx.globalAlpha = opacity;
        for (let j = 0; j < 2; j++) {
          const xx = (j ? -1 : 1) * (rear ? 0.84 : 1.04) * size + cx;
          const yy = (rear ? -0.999 : 0.68) * size + cy;
          const low = 0.13 * size,
            high = 4.65 * size,
            port = (rear ? -0.8 : -0.72) * size + cy;
          const pts = [
            [xx, port, low],
            [xx, yy, low],
            [xx, yy, high],
            [xx, port, high],
          ].map((v) => project(...v));
          stroke(
            ctx,
            pts,
            j ? "#b96a3d" : "#669f9e",
            Math.max(1.4, k * 0.048 * size),
          );
          const phase = (t * 0.22 + j * 0.37) % 1,
            pp = project(xx, yy, mix(low, high, j ? 1 - phase : phase));
          ctx.fillStyle = j ? "#f2c388" : "#bce2d5";
          ctx.beginPath();
          ctx.arc(...pp, Math.max(2, k * 0.045 * size), 0, 7);
          ctx.fill();
        }
        ctx.restore();
      }
      if (rear && f < 0.5) {
        const pts = cableRoute();
        stroke(ctx, pts, "#deb77d", 2.1);
        const u = (t * 0.42) % 1,
          seg = Math.min(2, Math.floor(u * 3)),
          alpha = u * 3 - seg;
        ctx.fillStyle = "#f8d4a0";
        ctx.beginPath();
        ctx.arc(
          mix(pts[seg][0], pts[seg + 1][0], alpha),
          mix(pts[seg][1], pts[seg + 1][1], alpha),
          3.4,
          0,
          7,
        );
        ctx.fill();
      } else if (f < 0.45) {
        const pts = [
          [-1.8, -1.3, 0.04],
          [-0.77, -1.3, 0.04],
          [-0.77, -0.87, 0.22],
          [-0.77, -0.87, 4.8],
        ].map((v) => project(...v));
        stroke(ctx, pts, "#bd9c58", 2);
        const u = (t * 0.38) % 1,
          seg = Math.floor(u * 3),
          q = u * 3 - seg;
        ctx.fillStyle = "#e6be6f";
        ctx.beginPath();
        ctx.arc(
          mix(pts[seg][0], pts[seg + 1][0], q),
          mix(pts[seg][1], pts[seg + 1][1], q),
          2.8,
          0,
          7,
        );
        ctx.fill();
      }
    }
    // The transition overlay uses the same camera projection as the solid parts.
    const face = (x, y, z, w, d) =>
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + d, z],
        [x, y + d, z],
      ].map((point) => project(...point));
    if (id === 0) {
      const top = layers.dieTop;
      for (let j = 0; j < 19; j++) {
        const y = (j - 9) * 0.16;
        const u = (t * 0.48 + j * 0.171) % 1;
        const a = project(-0.18 + 0.36 * u, y, top + 0.003),
          b = project(-0.14 + 0.36 * u, y, top + 0.003);
        stroke(
          ctx,
          [a, b],
          j % 4 ? "#d4a76b" : "#ffe6af",
          Math.max(1, k * 0.018),
        );
      }
      return {
        out: face(-1.605, -1.89, top, 1.56, 3.78),
        stencil: face(-2.935, -2.215, layers.interposerZ + 0.135, 5.87, 4.43),
        seam: face(-0.16, -1.69, top + 0.002, 0.32, 3.38),
      };
    }
    if (id === 6) {
      const layout = platformLayout(s.platformView);
      const quad = (shift, x, y, z, w, d) =>
        [
          [x, y],
          [x + w, y],
          [x + w, y + d],
          [x, y + d],
        ].map(([px, py]) => project(...stationPoint(shift, px, py, z)));
      if (s.platformView < 0.5)
        return {
          in: quad(layout.hgx, 1.69, 0.645, 0.41, 1.48, 1.55),
          out: quad(layout.hgx, -3.6, -2.35, 0.23, 7.2, 4.7),
        };
      const chip = quad(
        layout.gb,
        layout.cx + 0.115 * layout.scale,
        layout.cy + 0.1 * layout.scale,
        layout.z + 0.338 * layout.scale,
        1.85 * layout.scale,
        1.36 * layout.scale,
      );
      return {
        in: chip,
        out:
          s.platformView > 1.5
            ? quad(
                layout.shell,
                -trayWidth / 2,
                -trayDepth / 2,
                0.17,
                trayWidth,
                trayDepth,
              )
            : quad(
                layout.gb,
                layout.cx - 2.67 * layout.scale,
                layout.cy - 1.71 * layout.scale,
                layout.z + 0.15 * layout.scale,
                5.34 * layout.scale,
                3.42 * layout.scale,
              ),
      };
    }
    const pull = drawerPosition(p, s, forestLevel),
      rackScale = 1.73 / trayWidth,
      front = 0.88 + pull * 1.16;
    return {
      in: face(
        -0.865,
        Math.max(0.79, front - trayDepth * rackScale),
        0.95 + 0.17 * rackScale,
        1.73,
        Math.min(trayDepth * rackScale, front - 0.79),
      ),
    };
  }
  // Three registered ink separations of the SAME solids used for the opening.
  // Dynamic light is deposited between these surfaces in physical depth order.
  function makeRelief(view, previous, scale = 1.25, software = false) {
    const fw = 1200,
      fh = 680;
    ang = view.angle;
    elev = view.elevation;
    k = view.scale;
    const layers = packageLayers(view.open);
    const ca = Math.cos(ang),
      sa = Math.sin(ang),
      se = Math.sin(elev),
      ce = Math.cos(elev);
    ox = view.cx - k * (ca * view.x - sa * view.y);
    oy =
      view.cy -
      k * ((sa * view.x + ca * view.y) * se - (layers.dieTop + view.dz) * ce);
    const xx = ox,
      yy = oy,
      kk = k;
    const point = ([x, y, z]) => [
      xx + kk * (ca * x - sa * y),
      yy + kk * ((sa * x + ca * y) * se - z * ce),
    ];
    const passes =
      previous?.passes ||
      Array.from({ length: 3 }, () => document.createElement("canvas"));
    const contexts = passes.map((c) => {
      if (c.width !== fw * scale || c.height !== fh * scale) {
        c.width = fw * scale;
        c.height = fh * scale;
      }
      const g = c.getContext("2d", { willReadFrequently: software });
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.clearRect(0, 0, fw, fh);
      return g;
    });
    W = fw;
    H = fh;
    objects = [];
    packageScene(layers);
    ctx = contexts[0];
    shadow(4.4, 1.9, -0.37, 0.23);
    objects.sort((a, b) => a.z - b.z || (a.x - b.x) * sa + (a.y - b.y) * ca);
    for (const o of objects) {
      const center = point([o.x, o.y, o.z + o.h / 2]),
        rx = (kk * (Math.abs(ca) * o.w + Math.abs(sa) * o.d)) / 2,
        ry =
          (kk * ((Math.abs(sa) * o.w + Math.abs(ca) * o.d) * se + ce * o.h)) /
          2;
      if (
        center[0] + rx < 0 ||
        center[0] - rx > fw ||
        center[1] + ry < 0 ||
        center[1] - ry > fh
      )
        continue;
      const memory =
        o.part === "memory" || (o.part === "microbump" && Math.abs(o.x) > 1.64);
      ctx = contexts[memory ? 2 : o.part === "die" ? 1 : 0];
      if (view.cut > 0 && o.part === "memory") {
        const side = Math.sign(o.x),
          boundary = side * (1.78 + 0.13 * view.cut);
        const far = o.x + (side * o.w) / 2;
        if ((o.x - (side * o.w) / 2) * side < boundary * side) {
          o.w = Math.abs(far - boundary);
          o.x = (far + boundary) / 2;
          o.tex = {
            top: o.tex?.top || o.tex || memorySlice,
            side: sectionSide,
            front: o.tex?.front || sectionSide,
            back: o.tex?.back || sectionSide,
          };
        }
      }
      paintPackagePart(o, layers);
    }
    return { passes, point, layers, view };
  }
  return {
    draw,
    drawerPosition,
    forestAmount,
    rackYaw,
    layout,
    makeRelief,
    mask: landingMap,
  };
})();
