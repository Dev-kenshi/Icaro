import { useState } from 'react';

const MAPA_TERRA_NASA = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=BlueMarble_NextGeneration&STYLES=&SRS=EPSG%3A4326&BBOX=-180,-90,180,90&WIDTH=2048&HEIGHT=1024&FORMAT=image%2Fjpeg';

export default function TerraFundo() {
  const [imagemDisponivel, setImagemDisponivel] = useState(true);

  return (
    <div className="itc-earth-backdrop" aria-hidden="true" data-testid="background-earth">
      <div className="itc-earth-orbit">
        <div className="itc-earth-globe">
          <div className="itc-earth-map" data-fallback={!imagemDisponivel}>
            {imagemDisponivel ? (
              <img
                className="itc-earth-map-image"
                src={MAPA_TERRA_NASA}
                alt=""
                onError={() => setImagemDisponivel(false)}
              />
            ) : (
              <svg className="itc-earth-fallback-map" viewBox="0 0 1200 600" preserveAspectRatio="none">
                <path d="M74 128 111 93 167 83 191 104 222 102 241 126 226 150 199 158 185 185 160 196 153 226 130 231 113 212 89 203 80 177 58 159Z" />
                <path d="m203 236 31 6 19 25-8 34 16 24-10 37-15 28-7 52-17 33-15-27 3-41-18-33 5-34-15-31 8-40Z" />
                <path d="m304 123 29-17 43 12 22 23-9 21-37 1-13 22-32-12-23-25Z" />
                <path d="m520 119 35-18 28 12 24-5 25 18 29-9 32 18 29-9 45 19-1 25-30 15-25-9-23 21-28-7-18 22-31-9-16-22-22-1-15-27-31 1-21-21-33 4-15-22Z" />
                <path d="m572 213 37-16 40 15 12 32-21 25-9 42-22 29-24-18-6-34-24-22 3-32Z" />
                <path d="m705 283 37-14 31 16 5 29-29 18-37-12-18-18Z" />
                <path d="m797 134 44-24 38 12 23-15 46 20 19 28-23 26-44-6-20 15-38-13-27 17-29-21-30-7Z" />
                <path d="m894 252 32-14 37 15 23 34-18 41-31 22-17 37-33-19-7-41-21-22 7-31Z" />
                <path d="m1037 401 24-12 26 15-9 22-29 1Z" />
              </svg>
            )}
          </div>
          <div className="itc-earth-shade" />
          <div className="itc-earth-atmosphere" />
        </div>
      </div>
    </div>
  );
}
