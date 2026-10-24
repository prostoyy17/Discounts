// One product-type taxonomy for every store, so the site can filter "dairy" or
// "household chemicals" the same way in BİM, ŞOK, Migros and ВкусВилл.
//
// The store's own category decides when there is one; otherwise (BİM has no
// categories, some ВкусВилл items have none) the product name does.

export const GROUPS = [
  // food
  'dairy', 'meat', 'produce', 'bakery', 'staples', 'snacks', 'drinks', 'frozen', 'ready',
  // everything else
  'beauty', 'cleaning', 'baby', 'home', 'tech', 'clothes', 'hobby', 'pets', 'other',
];
export const FOOD = new Set(GROUPS.slice(0, 9));

// Store category -> group. First match wins; lower-cased with Turkish rules.
const BY_CATEGORY = [
  ['ready', /hazır yemek|готовая еда|^кафе$/],
  ['frozen', /dondur|заморож|замороз|морожен/],
  ['dairy', /süt|kahvaltı|молочн|^сыры$/],
  ['meat', /^et[ ,]|tavuk|balık|şarküteri|мясо|птица|рыба|колбас/],
  ['produce', /meyve|sebze|овощи/],
  ['bakery', /fırın|ekmek|хлеб/],
  ['snacks', /atıştırmal|сладост|орехи|снеки/],
  ['drinks', /içecek|напитки|чай и кофе|чай, кофе|алкоголь/],
  ['staples', /temel gıda|yemeklik|бакалея|крупы|консервы|масла, соусы|вегетариан|особое питание|спортивное питание|индилавка/],
  ['beauty', /kozmetik|kişisel bakım|косметика|здоровье|гигиена|для красоты/],
  ['cleaning', /temizlik|deterjan|kağıt|бытовая химия/],
  ['baby', /bebek|çocuk|для детей/],
  ['hobby', /kitap|kırtasiye|oyuncak|spor|канц|игрушк/],
  ['tech', /elektr|telefon|beyaz eşya|görüntü|ısıtma|bilgisayar/],
  ['clothes', /giyim|одежд/],
  ['pets', /evcil|животн/],
  ['home', /^ev[ ,]|yaşam|для дома|сад и огород|çiçek/],
  ['other', /подарк|хиты|автотовар/],
];

// Product name -> group, for stores without categories (BİM). Turkish names
// end with the head noun ("Fındık Kremalı Bisküvi", "Kahve Makinesi"), so the
// name is read from its last word backwards: the first word (or phrase
// starting there) that a group knows decides. Russian names start with it.
// Whole-name phrases are checked first for the few two-word exceptions.
const PHRASES = [
  ['baby', 'bebek bezi|bebek kolonya|bebek şampuan|bebek mama|biberon|emzik'],
  ['tech', 'hava nemlendirici|temizleme robotu|ankastre set|tüy toplama|hava üfleyici'],
  ['hobby', 'oyuncak|olta|yem bağlama|oyun hamuru|köpük hamur|pilates topu|yumruk topu|yoga bari|pilates yoga bari|kapi bari|spor aleti|sahte |vahşi hayvan|hot wheels'],
  ['cleaning', 'çamaşir suyu|kağit havlu|islak havlu|temizlik havlusu|oda kokusu'],
  ['beauty', 'ağda band|karin kemer|temizleme suyu|göz kalemi|dudak kalemi|diş firça|tarama sprey|masaj'],
  ['home', 'pazar arabasi|balik pulu|çelik ürün'],
  ['frozen', 'tirtikli patates|kriket patates|soğan halka'],
  ['staples', 'krem şanti|toz şeker|fistik ezmes|findik kremas|közlenmiş|parçacikli rende|kabartma toz|milföy'],
  ['snacks', 'kurutulmuş|metro büyük'],
];
const E = '(?![a-zçğıöşü])'; // word end
const WORDS = [
  ['tech', `makine|blender|süpürge|buzdolab|isitici|vantilatör|klima|tv${E}|televizyon|soundbar|kulaklik|hoparlör|şarj|powerbank|kamera|telefon|laptop|monitör|ütü${E}|fritöz|airfryer|kettle(?!bell)|yazici|tarayici|lazer|projektör|radyatör|konvektör|ampul|cihaz|ocak${E}|espresso|pompa`],
  ['clothes', `tişört|tshirt|t-shirt|sweat|pantolon|tayt|eşofman|mont${E}|ceket|yelek|kazak|hirka|gömlek|elbise|etek${E}|pijama|boxer|külot|slip|sütyen|bralet|büstiyer|atlet|çorap|çorab|patik|terlik|panduf|ayakkabi${E}|bot${E}|çizme|bere${E}|balaklava|atki|boyunluk|eldiven|şapka|şal${E}|çanta|cüzdan|polar|iç çamaşir|giyim`],
  ['hobby', `barbie|blok|aparat|powerband|süspansiyon|kavrama|salon seti|yapim|hobi|mühür|damga|küpü|oyuncak|lego|puzzle|yapboz|oyun|kitap(?!lik)|defter|kalem|boya|tuval(?!et)|şövale|firça|olta|zoka|misina|balikçi|jig${E}|kanca|kamiş|makara|kamp${E}|çadir|bisiklet|koşu band|band|dambil|dumble|kettlebell|ağirl|pilates|yoga|boks|lapa${E}|roller|çember|trambolin|dart${E}|figür|araba|pist|rampa|robot|kart|sürpriz|yumak|makas|delgeç|manken|bant${E}|tabanca|fosfor|firdöndü|egzersiz|ems${E}|el yayi|gergi|push up|şut${E}|taç${E}|enchantimals|bonitap|işildak|thigh`],
  ['pets', `kedi${E}|köpek|kuş yemi|evcil`],
  ['cleaning', `deterjan|yumuşatici|bulaşik|temizleyici|temizlik|leke|beyazlatici|kireç|sünger|bez[iİ]?${E}|mendil|peçete|tuvalet kağid|kağit havlu|çöp|hava tazeley|mop${E}|yağ çözücü|derz`],
  ['beauty', `şampuan(?!lik)|saç${E}|krem${E}|kremi${E}|losyon|sabun(?!luk)|duş jel|deodorant|parfüm|kolonya|maskara|ruj${E}|dudak|oje${E}|fondöten|allik|far${E}|makyaj|tint${E}|nemlendirici|maske|serum|tonik|vazelin|ağda|jilet|tiraş|diş${E}|ped${E}|tampon|hijyen|body mist|bronzer|kapatici|balm`],
  ['home', `tencere|tava${E}|sahan|tabak|tabağ|kase${E}|bardak|bardağ|fincan|kupa${E}|çaydanlik|demlik|kavanoz|saklama|kabi${E}|kaplari|kutu|organizer|düzenleyici|sepet|aski|çerçeve|ayna${E}|vazo|mum${E}|hali${E}|halisi|kilim|perde|nevresim|çarşaf|yastik|yorgan|battaniye|havlu|örtü|alez|sehpa|dola[pb]|gardirop|raf${E}|sandalye|masa|puf${E}|abajur|lamba|biça[kğ]|kaşik|çatal|spatula|rende|sikacağ|öğütücü|bileyici|doğrayici|termos|matara|tepsi|kalib|güveç|sunum|servis|kurabiyelik|dikiş|bahçe|saksi(?!li)|dekor|yolluk|paspas|sürahi|badya|süzgeç|kapağ|streç|ayakkabilik|kitaplik|vitrin|şemsiye|kesme tahta|köşesi|şampuanlik`],
  ['frozen', `dondurma|dondurulmuş|donuk`],
  ['ready', `çiğ köfte|köfte|döner|sarma|rus salatasi|salata|pizza|manti|lazanya|börek|pilaki`],
  ['dairy', `süt${E}|yoğurt|ayran|kefir|peynir|kaşar|lor${E}|krema(?!l)|kaymak|tereyağ|labne|yumurta|ricotta|kremsos|margarin`],
  ['meat', `et${E}|eti${E}|dana|kuzu|tavuk|piliç|hindi${E}|sucuk|salam|sosis|frankfurter|pastirma|kavurma|kiyma|biftek|bonfile|kanat|baget|füme|kebap|balik|ton${E}|somon|hamsi|karides`],
  ['produce', `elma${E}|armut|muz${E}|portakal|mandalina|limon${E}|üzüm|domates|salatalik|biber|patates|soğan|havuç|ispanak|marul|meyve|sebze|mango|hurma${E}|patlican`],
  ['bakery', `ekmek|ekmeğ|simit|poğaça|lavaş|tortilla|bazlama|pide|kek${E}|kruvasan|tart${E}|ekmecik`],
  ['drinks', `su${E}|suyu|soda|kola${E}|gazoz|nektar|çay|kahve|içecek|içeceğ|limonata|shot|latte|milkshake`],
  ['snacks', `çikolata|gofret|bisküvi|kraker|cips|kurabiye|şeker|lokum|helva|pişmaniye|sakiz|marshmallow|jelibon|bar${E}|bari${E}|çerez|findik|fistik|badem|ceviz|kuruyemiş|patlağ|nuga|topu${E}|dido`],
  ['staples', `un${E}|makarna|pirinç|bulgur|mercimek|nohut|fasulye|yağ|zeytin|salça|sos${E}|sosu|ketçap|mayonez|sirke|baharat(?!li)|tuz${E}|maya${E}|vanilin|nişasta|irmik|bal${E}|bali${E}|reçel|pekmez|tahin|kakao|konserve|turşu|ekşisi|bulyon|çorba|yulaf|müsli|gevrek|erişte|tohum|hamur|karbonat`],
  // Russian (ВкусВилл items without a category: mostly alcohol)
  ['drinks', 'пиво|сидр|вино|шампанск|игрист|медовух|коктейл|напиток|сок|вода|чай|кофе|капучино|латте|какао'],
  ['ready', 'ролл|котлет|биточки|суп|салат|пюре|плов|паста|боул|омлет|каша|блин'],
];
// Upper-case "I" lower-cases to "ı" in Turkish ("TSHIRT" -> "tshırt"), so both
// sides drop the dot difference.
const undot = (s) => s.replace(/ı/g, 'i').replace(/i̇/g, 'i');
const lower = (s) => undot((s ?? '').toLocaleLowerCase('tr'));
const PHRASE_RE = PHRASES.map(([g, src]) => [g, new RegExp(undot(src))]);
const WORD_RE = WORDS.map(([g, src]) => [g, new RegExp(`^(?:${undot(src)})`)]);
const CAT_RE = BY_CATEGORY.map(([g, re]) => [g, new RegExp(undot(re.source))]);

/** Group of one product: store category first, product name as fallback. */
export function productGroup(p) {
  const cat = lower(p.category);
  if (cat) for (const [g, re] of CAT_RE) if (re.test(cat)) return g;
  const name = lower(p.name).replace(/[^a-zа-яёçğöşü0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [g, re] of PHRASE_RE) if (re.test(name)) return g;
  const words = name.split(' ');
  const order = /[а-яё]/.test(name) ? words.map((_, i) => i) : words.map((_, i) => words.length - 1 - i);
  for (const i of order) {
    const tail = words.slice(i).join(' ');
    for (const [g, re] of WORD_RE) if (re.test(tail)) return g;
  }
  return 'other';
}
