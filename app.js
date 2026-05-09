const SatSim = window.SatSim;

if (!SatSim) {
  throw new Error("SatSim CDN bundle was not loaded.");
}

const {
  Universe,
  createViewer,
  getVisibility,
  southEastZenithToAzEl,
  CesiumMath,
  JulianDate,
  ClockRange,
  ClockStep,
  Cartesian3,
  Color,
  Ion
} = SatSim;

const ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1NjIxNTZlNi0wN2M1LTQxYWQtYTUwMC1kNzVhZmMzNWQ1MWUiLCJpZCI6MTI3NzMxLCJpYXQiOjE3MDU1NzQwODN9.cAvQ_dtcdKTGMI2giIPbHoyQXAziP30lgcryowdiWzc";
const WEATHER_API_KEY = "7095421a34694ea9cb80a0c531ca5e24";

if (Ion) {
  Ion.defaultAccessToken = ION_TOKEN;
}

CesiumMath.setRandomNumberSeed(42);

function defined(value) {
  return value !== undefined && value !== null;
}

class DynamicProperty {
  constructor(callback, isConstant) {
    this._callback = callback;
    this._isConstant = isConstant;
    this._definitionChanged = {
      addEventListener() {
        return () => {};
      },
      removeEventListener() {
        return true;
      },
      raiseEvent() {}
    };
  }

  get isConstant() {
    return this._isConstant;
  }

  get definitionChanged() {
    return this._definitionChanged;
  }

  getValue(time, result) {
    return this._callback(time, result);
  }

  equals(other) {
    return other === this || (
      other instanceof DynamicProperty &&
      other._callback === this._callback &&
      other._isConstant === this._isConstant
    );
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonToHtmlBullets(json, indent = 0) {
  let html = "";
  const indentString = "&nbsp;".repeat(indent);

  Object.entries(json).forEach(([key, value]) => {
    html += `${indentString}&bull; ${escapeHtml(key)}`;

    if (typeof value === "object" && value !== null) {
      html += `<br>${jsonToHtmlBullets(value, indent + 4)}`;
    } else {
      html += `: ${escapeHtml(value)}<br>`;
    }
  });

  return html;
}

function buildVisibilityTable(visibility) {
  const rows = visibility.map((v) => {
    const brightness = defined(v.mv) ? v.mv.toFixed(1) : "???";
    const phase = defined(v.phaseAngle) ? v.phaseAngle.toFixed(1) : "&mdash;";
    const sensor = defined(v.sensor) ? escapeHtml(v.sensor) : "&mdash;";
    const rate = defined(v.angRateArcsecPerSec) ? v.angRateArcsecPerSec.toFixed(1) : "&mdash;";
    const elevation = defined(v.el) ? v.el.toFixed(1) : "&mdash;";

    return `
      <tr>
        <td>${sensor}</td>
        <td>${v.visible ? "Yes" : "-"}</td>
        <td style="text-align:right">${elevation}&deg;</td>
        <td style="text-align:right">${phase}&deg;</td>
        <td style="text-align:right">${brightness}</td>
        <td style="text-align:right">${rate} &quot;/s</td>
      </tr>`;
  }).join("");

  return `
    <table style="border-collapse:collapse; width:100%; margin-top:4px">
      <thead>
        <tr>
          <th style="text-align:left; padding-bottom:2px">Sensor</th>
          <th style="text-align:left; padding-bottom:2px">Visible</th>
          <th style="text-align:right; padding-bottom:2px">El</th>
          <th style="text-align:right; padding-bottom:2px">Solar</th>
          <th style="text-align:right; padding-bottom:2px">VMag</th>
          <th style="text-align:right; padding-bottom:2px">Rate</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function optimizeSatellitePointVisualizer(universe, satellite) {
  const visualizer = satellite.visualizer;
  if (!defined(visualizer?.point2)) {
    return;
  }

  const position = new Cartesian3();
  visualizer.update = (time, activeUniverse = universe) => {
    if (!JulianDate.equals(activeUniverse.earth.time, time)) {
      activeUniverse.earth.update(time, activeUniverse);
    }

    activeUniverse.earth.transformPointFromWorld(satellite.worldPosition, position);
    visualizer.point2.position = position;
  };
}

function generateSatelliteVisualizer(universe, viewer, satellite, html, showPath = false, showLabel = false, color = undefined) {
  const description = new DynamicProperty(() => {
    const visibility = getVisibility(universe, viewer, universe._observatories, satellite);
    const visibleCount = visibility.filter((v) => v.visible).length;

    return `<div><b>${escapeHtml(satellite.name)}</b><br><br>
      ${html}<br>
      Visibility: ${visibleCount} / ${universe._observatories.length}<br>
      ${buildVisibilityTable(visibility)}
      <br></div>
      Orbit:<br>
      &bull; Period: ${(satellite.period / 60).toFixed(2)} min<br>
      &bull; Eccentricity: ${satellite.eccentricity.toFixed(9)}<br>`;
  }, false);

  const visualizerColor = color ?? Color.fromRandom({ alpha: 1.0 });

  viewer.addObjectVisualizer(satellite, description, {
    path: {
      show: showPath,
      leadTime: satellite.period / 2,
      trailTime: satellite.period / 2,
      resolution: satellite.period / (500 / (1 - satellite.eccentricity)),
      material: visualizerColor,
      width: 1
    },
    point: {
      pixelSize: Math.random() * 3 + 2,
      color: visualizerColor,
      outlineColor: visualizerColor,
      show: true
    },
    label: showLabel ? {
      text: satellite.name,
      show: showLabel,
      font: "12px sans-serif",
      fillColor: visualizerColor
    } : undefined
  });
  optimizeSatellitePointVisualizer(universe, satellite);
}

function generateGroundObservatoryVisualizer(viewer, observatory) {
  const site = observatory.site;
  const description = `<div><b>${escapeHtml(site.name)}</b><br><br>
    Latitude: ${site.latitude} deg<br>
    Longitude: ${site.longitude} deg<br>
    Altitude: ${site.altitude} m<br><br></div>`;

  viewer.addObservatoryVisualizer(observatory, description);
}

async function loadSatellites(universe, viewer, url, linesPerTle = 3, showPath = false, showLabel = false) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load TLE data from ${url}: ${response.status} ${response.statusText}`);
  }

  const lines = (await response.text()).split("\n");
  const count = lines.length - 1;

  for (let i = 0; i < count; i += linesPerTle) {
    let line1;
    let line2;
    let line3 = "";

    if (linesPerTle === 2) {
      line1 = lines[i].slice(2, 8);
      line2 = lines[i];
      line3 = lines[i + 1];
    } else {
      line1 = lines[i].trim();
      line2 = lines[i + 1];
      line3 = lines[i + 2];
    }

    if (universe.hasObject(line1)) {
      continue;
    }

    const satellite = universe.addSGP4Satellite(line1, line2, line3, "nadir", true);
    satellite.model = {
      mode: "lambertianSphere",
      diameter: 1.0,
      albedo: 0.25
    };

    const description = `TLE:<br>${escapeHtml(line2)}<br>${escapeHtml(line3)}<br><br>Model:<br>${jsonToHtmlBullets(satellite.model)}`;
    generateSatelliteVisualizer(universe, viewer, satellite, description, showPath, showLabel);
  }

  return response;
}

async function loadSensors(universe, viewer, url) {
  const response = await fetch(url);
  const json = await response.json();

  json.forEach((obs) => {
    const observatory = universe.addGroundElectroOpticalObservatory(
      obs.name,
      obs.latitude,
      obs.longitude,
      obs.altitude,
      "AzElGimbal",
      obs.height,
      obs.width,
      obs.y_fov,
      obs.x_fov,
      obs.field_of_regard
    );

    generateGroundObservatoryVisualizer(viewer, observatory);
    observatory.gimbal.trackMode = "rate";
  });
}

function showTrackedPath(gimbal, show) {
  const trackedObject = gimbal.trackObject;
  const visualizer = trackedObject?.visualizer;
  if (!defined(visualizer)) {
    return;
  }

  if (typeof visualizer._satsimViewer?.setObjectPathEnabled === "function") {
    visualizer._satsimViewer.setObjectPathEnabled(trackedObject, show);
    return;
  }

  if (defined(visualizer.path)) {
    visualizer.path.show = show;
  }
}

function randomTrack(universe, observatory, time, maxIterations = 500) {
  showTrackedPath(observatory.gimbal, false);

  const numTrackables = universe._trackables.length;
  if (numTrackables === 0) {
    return;
  }

  const localPos = new Cartesian3();
  let iterations = maxIterations;

  while (iterations >= 0) {
    const object = universe._trackables[Math.floor(Math.random() * numTrackables)];
    if (defined(object)) {
      observatory.site.transformPointFromWorld(object.worldPosition, localPos);
      const [, el] = southEastZenithToAzEl(localPos);

      if (object.period < 2000 * 60 && el > 30) {
        observatory.gimbal.trackObject = object;
        observatory.gimbal.update(time, universe);
        break;
      }
    }

    iterations -= 1;
  }

  showTrackedPath(observatory.gimbal, true);
}

async function init() {
  const universe = new Universe();
  const viewer = createViewer("cesiumContainer", universe, {
    showWeatherLayer: true,
    showNightLayer: true,
    weatherApiKey: WEATHER_API_KEY
  });
  window.satsimDemo = { universe, viewer };

  const start = JulianDate.now();
  viewer.clock.startTime = start.clone();
  viewer.clock.stopTime = JulianDate.addSeconds(start, 60 * 60 * 24, new JulianDate());
  viewer.clock.currentTime = start.clone();
  viewer.clock.clockRange = ClockRange.LOOP_STOP;
  viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;

  await loadSensors(universe, viewer, "assets/sites.json");
  await loadSatellites(universe, viewer, "assets/celestrak_sat_elem.txt");

  universe.update(start);
  universe._observatories.forEach((observatory) => {
    randomTrack(universe, observatory, start);
  });

  const lastTrackTime = new JulianDate();
  viewer.scene.preUpdate.addEventListener((scene, time) => {
    if (Math.abs(JulianDate.secondsDifference(lastTrackTime, time)) > 15) {
      const observatories = universe._observatories;
      randomTrack(universe, observatories[Math.floor(Math.random() * observatories.length)], time);
      JulianDate.clone(time, lastTrackTime);
    }
  });
}

window.sel = function sel() {
  console.log("sel");
};

init().catch((error) => {
  console.error("Failed to initialize SatSimJS demo.", error);
});
