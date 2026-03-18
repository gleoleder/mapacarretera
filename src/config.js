import tinycolor from 'tinycolor2';

export default {
  areaServer: 'https://d2uf7yjjctyxf.cloudfront.net/nov-02-2020',

  getDefaultLineColor() {
    return tinycolor('rgba(232, 255, 71, 0.85)'); // amarillo mapacarretera
  },
  getLabelColor() {
    return tinycolor('#eeede6');
  },
  getBackgroundColor() {
    return tinycolor('#08080d');
  }
}
