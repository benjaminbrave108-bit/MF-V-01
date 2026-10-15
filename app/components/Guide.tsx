"use client";

import { useState, type ReactNode } from "react";
import { Title } from "./shared";
import { tx } from "../lib/i18n";
import type { Language } from "../lib/types";

// Kullanım Kılavuzu — kendi sol menü girişi (Ayarlar'ın hemen altında),
// tamamen statik/bilgilendirici bir sayfa, gerçek bir veri kaynağına bağlı
// değil. Örnekler kurgusal bir şirket ("Örnek A.Ş.") üzerinden anlatılır;
// burada hiçbir gerçek kullanıcı verisi görünmez. Her başlık/metin tx() ile
// üç dile de (tr/en/ku) bağlı — dil değiştirildiğinde içerik de değişir.
export function Guide({ language }: { language: Language }) {
  type GuideTopic = { id: string; title: string; body: ReactNode };
  const topics: GuideTopic[] = [
    {
      id: "overview",
      title: tx(language, "Genel Bakış", "Overview", "Nêrîna Giştî"),
      body: (
        <>
          <p>
            {tx(
              language,
              "Maliye-Finans; kasalarınızı, gelirlerinizi ve giderlerinizi tek bir yerden yönetmenizi sağlar. Aşağıdaki örnekler kurgusal bir şirket olan \"Örnek A.Ş.\" üzerinden anlatılmıştır — burada gerçek bir veri yoktur.",
              "Maliye-Finans lets you manage your cash accounts, income and expenses in one place. The examples below use a fictional company, \"Örnek A.Ş.\" — nothing here is real data.",
              "Maliye-Finans dihêle hûn qase, dahat û mesrefên xwe ji cîhekî bi rêve bibin. Mînakên jêrîn bi rêya kompaniyeke xeyalî \"Örnek A.Ş.\" hatine vegotin — li vir tu daneyên rastîn tune ne.",
            )}
          </p>
          <p>
            {tx(
              language,
              "Sol menüden Kasalar, Gelir, Gider, Listeler, Rapor Hazırla, Mali Özel Notlarım, Yorumlar, Arşiv, Kullanıcılar ve Ayarlar bölümlerine ulaşabilirsiniz. Her bölüm, yalnızca yetkiniz olan verileri gösterir.",
              "The left menu gives you access to Kasalar (Cash), Gelir (Income), Gider (Expense), Listeler (Lists), Rapor Hazırla (Prepare Report), Mali Özel Notlarım (Private Notes), Yorumlar (Comments), Arşiv (Archive), Kullanıcılar (Users) and Ayarlar (Settings). Each section only shows data you're permitted to see.",
              "Ji menuya çepê hûn dikarin bigihîjin beşên Qase, Dahat, Mesref, Lîste, Raporê Amade Bike, Nîşeyên Min ên Taybet, Şîrove, Arşîv, Bikarhêner û Mîheng. Her beş tenê daneyên ku destûra we jê heye nîşan dide.",
            )}
          </p>
        </>
      ),
    },
    {
      id: "cash",
      title: tx(language, "Kasalar", "Cash Accounts", "Qase"),
      body: (
        <>
          <p>
            {tx(
              language,
              "Bir kasa, fiziksel veya sanal bir para havuzunu temsil eder — örneğin \"Örnek A.Ş. — Merkez Kasa\" veya \"Örnek A.Ş. — Şube Kasası\". Yeni bir kasa açmak için Kasalar sayfasında \"Yeni Kayıt\" butonuna basıp Kasa Adı'nı girmeniz yeterlidir.",
              "A kasa represents a physical or virtual pool of money — e.g. \"Örnek A.Ş. — Head Office\" or \"Örnek A.Ş. — Branch\". To open a new one, go to Kasalar and press \"Yeni Kayıt\", then enter its name.",
              "Qasek berhevoka pere ya fîzîkî an sanal temsîl dike — mînak \"Örnek A.Ş. — Navenda Sereke\" an \"Örnek A.Ş. — Şaxê\". Ji bo veke, biçe Qase, bitikîne \"Tomarek Nû\" û navê wê binivîse.",
            )}
          </p>
          <p>
            {tx(
              language,
              "Bir kasaya tıkladığınızda o kasanın toplam gelir/gider dökümünü ve bakiyesini görürsünüz. Kasalar > Paylaş ile başka bir kullanıcıyla salt-okunur paylaşabilirsiniz.",
              "Clicking a kasa shows its full income/expense breakdown and balance. Use Kasalar > Share to give another user read-only access to it.",
              "Dema hûn li qasekê bitikînin, tevahiya dahat/mesref û bakiya wê xuya dike. Bi Qase > Parve Bike hûn dikarin bikarhênerekî din re gihîştina tenê-xwendinê bidin.",
            )}
          </p>
        </>
      ),
    },
    {
      id: "records",
      title: tx(language, "Gelir / Gider Kayıtları", "Income / Expense Records", "Qeydên Dahat / Mesref"),
      body: (
        <>
          <p>
            {tx(
              language,
              "Örnek: Örnek A.Ş. Eylül ayında \"Ofis Kirası\" için 15.000 ₺ gider, \"Danışmanlık Geliri\" için 40.000 ₺ gelir kaydı girebilir. Her kayıtta tarih, ana başlık, tutar/para birimi ve isteğe bağlı olarak kişi, birim adı, detay ve etiketler bulunur.",
              "Example: in September, Örnek A.Ş. might log a 15,000 ₺ \"Office Rent\" expense and a 40,000 ₺ \"Consulting Income\" income record. Every record has a date, category, amount/currency, and optionally a person, unit name, detail and tags.",
              "Mînak: Örnek A.Ş. di îlonê de dikare mesrefek 15.000 ₺ ji bo \"Kirêya Ofîsê\" û dahatek 40.000 ₺ ji bo \"Dahata Şêwirmendiyê\" têxe. Her qeyd tarîx, sernav, meblağ/pere û bi dilxwazî kes, nav, hûrgilî û etîketan digire.",
            )}
          </p>
          <p>
            {tx(
              language,
              "Bir gelir/gider kaydını bir kasaya bağlamak için \"Kasa Seç\" alanını kullanın — böylece o tutar, ilgili kasanın bakiyesine yansır.",
              "Use \"Select Cash Account\" to link an income/expense record to a kasa — its amount then reflects in that kasa's balance.",
              "Ji bo qeydek dahat/mesref bi qasekê ve girê bidin, \"Qase Hilbijêre\" bikar bînin — meblağ dê di bakiya wê qasê de xuya bibe.",
            )}
          </p>
        </>
      ),
    },
    {
      id: "listRecords",
      title: tx(language, "Liste Kaydı", "List Record", "Qeyda Lîsteyê"),
      body: (
        <p>
          {tx(
            language,
            "Birbiriyle ilgili birden fazla kaydı ortak bir başlık altında toplamak isterseniz \"Liste Kaydı\" seçeneğini işaretleyip bir liste adı girin — örneğin Örnek A.Ş.'nin \"2026 Fuar Bütçesi\" için yaptığı tüm harcamaları \"Fuar 2026\" listesinde toplayabilirsiniz. Bu kayıtlar, sayfanın altındaki sarı \"Tüm Liste Gelirleri/Giderleri\" satırında ayrıca özetlenir.",
            "To group several related records under one label, check \"List Record\" and give it a name — e.g. all of Örnek A.Ş.'s spending on its \"2026 Trade Fair Budget\" could be grouped under \"Fair 2026\". These records are also summarized separately in the yellow \"All List Income/Expenses\" row below the main grid.",
            "Ji bo çend qeydên têkildar bin sernavekî hevpar bicivînin, \"Qeyda Lîsteyê\" nîşan bikin û navekî lê bikin — mînak hemû lêçûnên Örnek A.Ş. yên \"Bûdceya Pêşangeha 2026\" dikare di lîsteya \"Pêşangeh 2026\" de bicive. Ev qeyd di rêza zer a \"Hemû Dahat/Mesrefên Lîsteyê\" de jî bi taybetî tên kurtkirin.",
          )}
        </p>
      ),
    },
    {
      id: "lists",
      title: tx(language, "Listeler (Liste Kasaları)", "Lists (List Cash Accounts)", "Lîste (Qaseyên Lîsteyê)"),
      body: (
        <>
          <p>
            {tx(
              language,
              "Listeler sayfası bir liste kasasının (çalışma alanının) gelirini, giderlerini ve giderlerin kişilere dağılımını gösterir. Örnek A.Ş.'nin \"2026-V\" kasasında olduğu gibi: kasa geliri, kasaya bağlı Gider kayıtları ve her giderden hangi kişiye ne kadar düştüğü tek tabloda görülür.",
              "The Lists page shows a list cash account's (workspace's) income, its expenses and how those expenses are allocated to people. As in Örnek A.Ş.'s \"2026-V\" account: cash income, the Expense records linked to the account and how much of each expense went to each person are shown in one table.",
              "Rûpela Lîste dahat, mesref û dabeşkirina mesrefan ji kesan re ya qaseyeke lîsteyê (qada xebatê) nîşan dide. Wekî di qaseya \"2026-V\" a Örnek A.Ş. de: dahata qaseyê, tomarên Mesrefê yên girêdayî qaseyê û ji her mesrefê çiqas ketiye ser kîjan kesî di tabloyekê de tê dîtin.",
            )}
          </p>
          <ul>
            <li>
              {tx(
                language,
                "Yeni çalışma alanı: Listeler sayfasında \"＋ Yeni Çalışma Alanı\" ile bir kasa seçin. Ad, gelir tutarı (kasadan otomatik ya da elle; \"Kasadaki tutarı getir\" düğmesi mevcut tutarı yazar) ve not isteğe bağlıdır. Kasalar'da yeni kayıt açarken \"Liste Kasası (Çalışma Alanı)\" kutusunu işaretlerseniz de kasa Listeler'de otomatik çalışma alanı olur; işaretli kasa üstteki kasa kartlarında değil yalnızca \"Tüm Liste Kasaları\" bölümünde görünür.",
                "New workspace: on the Lists page use \"＋ New Workspace\" and pick a cash account. Name, income amount (automatic from the cash account or manual; the \"Fetch the cash account amount\" button fills the current amount) and note are optional. If you tick \"List Cash Account (Workspace)\" on a new Kasalar record, the account also becomes a workspace automatically; a ticked account is not among the top cash cards but only under \"All List Accounts\".",
                "Qada xebatê ya nû: li rûpela Lîste bi \"＋ Qada Xebatê ya Nû\" qaseyekê hilbijêrin. Nav, mîqdara dahatê (ji qaseyê bixweber an bi destî; bişkoka \"Mîqdara qaseyê bîne\" mîqdara heyî dinivîse) û nîşe bijarte ne. Heke di qeydekê nû ya Qase de \"Qaseya Lîsteyê (Qada Xebatê)\" nîşan bikin, qase bixweber dibe qada xebatê; qaseya nîşankirî di kartên jorîn de nayê xuyakirin, tenê di \"Hemû Qaseyên Lîsteyê\" de ye.",
              )}
            </li>
            <li>
              {tx(
                language,
                "Kasa geliri ve kasa gideri: Gelir/Kasa kayıtlarından gelen tutar kasa gelirini; Gider sayfasında bu kasa seçilerek girilen giderler kasa giderini oluşturur. Kasada kalan = kasa geliri − kasa gideri. Gider eklemek için Gider sayfasında ilgili Liste Kasası'nı seçin.",
                "Cash income and cash expense: amounts from Income/Cash records make the cash income; expenses entered on the Expense page with this account selected make the cash expense. Cash left = cash income − cash expense. To add an expense, pick the List Cash Account on the Expense page.",
                "Dahata qaseyê û mesrefa qaseyê: mîqdarên ji tomarên Dahat/Qase dahata qaseyê pêk tînin; mesrefên di rûpela Mesref de bi hilbijartina vê qaseyê têne tomarkirin mesrefa qaseyê pêk tînin. Mayî di qaseyê de = dahat − mesref. Ji bo zêdekirina mesrefê di rûpela Mesref de Qaseya Lîsteyê hilbijêrin.",
              )}
            </li>
            <li>
              {tx(
                language,
                "Kişilere dağıtım: tabloda her gider bir satırdır; soldan sağa Tarih, Gider, Not, Gider tutarı, sonra her kişi için bir sütun, Dağıtılan ve Kalan gelir. Kişinin hücresine yazdığınız tutar o kişinin bu giderdeki harcamasıdır (Enter ile kaydedilir). \"Kalan\", giderin henüz kimseye yazılmamış kısmıdır. Kişi eklemek için \"Kalan\" başlığındaki \"＋ Kişi ekle\" ya da alttaki \"Kişileri yönet\" sekmesini kullanın. Kişi sütunları \"◂ / ▸\" düğmesiyle kapanıp açılır. \"Kişilerde kalan\" diye bir tutar yoktur.",
                "Allocation to people: in the table each expense is a row; from left to right Date, Expense, Note, Expense amount, then one column per person, Allocated and Left. The amount you type in a person's cell is that person's spending in this expense (Enter saves). \"Left\" is the part of the expense not yet written to anyone. To add a person use \"＋ Add person\" in the \"Left\" header or the \"Manage people\" tab below. Person columns collapse and expand with the \"◂ / ▸\" button. There is no \"left with people\" amount.",
                "Dabeşkirin ji kesan re: di tabloyê de her mesref rêzek e; ji çepê ber bi rastê Dîrok, Mesref, Nîşe, Mîqdara mesrefê, paşê ji bo her kesî stûnek, Hatiye dabeşkirin û Mayî tên. Mîqdara ku hûn di şaneya kesî de dinivîsin lêçûna wî/wê di vê mesrefê de ye (Enter tomar dike). \"Mayî\" beşa mesrefê ye ku hê ji tu kesî re nehatiye nivîsandin. Ji bo zêdekirina kesekî \"＋ Kes zêde bike\" a di sernavê \"Mayî\" de an tabloya \"Kesan birêve bibe\" ya jêrîn bikar bînin. Stûnên kesan bi bişkoka \"◂ / ▸\" vedibin û digirin. Mîqdareke \"li cem kesan\" tune.",
              )}
            </li>
            <li>
              {tx(
                language,
                "Alt sekmeler: \"Dağıtılan miktarı görüntüle\" her kişinin toplam harcamasını ve dağıtılmamış tutarı, \"Kişileri yönet\" kişi ekleme/adlandırma/silmeyi, \"Kişi hesapları\" kişi × gider dökümünü gösterir.",
                "Sub-tabs: \"View distributed amount\" shows each person's total spending and the unallocated amount, \"Manage people\" handles adding/renaming/deleting people and \"Person accounts\" shows the person × expense breakdown.",
                "Tabloyên jêrîn: \"Mîqdara hatiye dabeşkirin nîşan bide\" lêçûna giştî ya her kesî û mîqdara nehatiye dabeşkirin, \"Kesan birêve bibe\" zêdekirin/guherîn/jêbirina kesan û \"Hesabên kesan\" dabeşkirina kes × mesref nîşan dide.",
              )}
            </li>
            <li>
              {tx(
                language,
                "Sonuçları Görüntüle: hem Listeler ana sayfasında hem çalışma alanında bulunur; kasa geliri, kasa giderleri, kişi harcamaları ve kasada kalan tutarı Kasalar'daki \"Sonuç Oluştur\" raporuyla aynı görünümde gösterir; Excel'e aktarılabilir.",
                "View Results: available on the Lists main page and inside a workspace; it shows cash income, cash expenses, people's spending and cash left in the same layout as the Kasalar \"Create Result\" report, and can be exported to Excel.",
                "Encaman Nîşan Bide: li rûpela serekî ya Lîste û di nav qada xebatê de heye; dahata qaseyê, mesrefên qaseyê, lêçûnên kesan û mayî di qaseyê de bi heman dîmenê raporê \"Encamê Biafirîne\" a Qase nîşan dide; dikare ji Excelê re were derxistin.",
              )}
            </li>
            <li>
              {tx(
                language,
                "Tablo sütunları: Tarih, Gider, Not, Gider tutarı ve kişi sütunlarının genişliği başlığın sağ kenarındaki tutamaçtan sürüklenerek ayarlanır; çift tıklayınca varsayılana döner. Tarayıcı ayarı hatırlar.",
                "Table columns: drag the handle on a header's right edge to change the width of Date, Expense, Note, Expense amount and person columns; double-click resets it. The browser remembers your settings.",
                "Stûnên tabloyê: firehiya stûnên Dîrok, Mesref, Nîşe, Mîqdara mesrefê û kesan bi kişandina tutamaka li kêleka rastê ya sernavê tê guhertin; du caran bitikînin vedigere bingehîn. Gerok mîhengê tomar dike.",
              )}
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "kasaBoxes",
      title: tx(language, "Gelir, Gider ve Kasa Kutuları", "Income, Expense and Cash Boxes", "Qutiyên Dahat, Mesref û Qaseyê"),
      body: (
        <>
          <p>
            {tx(
              language,
              "Her gelir ve gider bir kasaya bağlı girilir. Gelir ve Gider sayfalarında ilk satırda \"Tüm Gelirler/Giderler\" kutusunun sağında kayıt başlığı kutuları ve kasa kutuları (ör. \"Ana Kasa Giderleri\") yer alır; başlık kutularında bağlı kasa küçük bir etiketle görünür. Kutunun adının yanındaki parantezdeki sayı kayıt sayısıdır. Kasa kutusuna tıklayınca tablo o kasanın kayıtlarıyla süzülür.",
              "Every income and expense is entered against a cash account. On the Income and Expense pages the first row has the \"All Income/Expenses\" box followed by record-title boxes and cash-account boxes (e.g. \"Main Cash Expenses\"); title boxes show their linked cash account as a small tag. The number in parentheses next to a name is the record count. Clicking a cash-account box filters the table to that account's records.",
              "Her dahat û mesref bi qaseyekê ve tê tomarkirin. Di rûpelên Dahat û Mesref de di rêza yekem de li rastê qutiya \"Hemû Dahat/Mesref\" qutiyên sernavê û qutiyên qaseyê (mînak \"Mesrefên Qaseya Sereke\") hene; di qutiyên sernavê de qaseya girêdayî bi etîketeke biçûk xuya dibe. Hejmara di nav parantezê de li kêleka navê hejmara qeydan e. Bi tikandina qutiya qaseyê tablo bi qeydên wê qaseyê tê parzûnkirin.",
            )}
          </p>
          <p>
            {tx(
              language,
              "Kasalar sayfasında her kasa kartı o kasanın geliri (↗), gideri (↘) ve sonucunu gösterir; \"Tüm Kasalar\" ve \"Tüm Liste Kasaları\" kutuları da aynı satırlara sahiptir. Listelerle ilişkili (Liste Kasası) kasalar üstteki kasa kartlarında değil, ikinci satırdaki \"Tüm Liste Kasaları\" bölümünde görünür. Geliri ya da gideri olmayan (tutarı sıfır) kasa ve liste kutuları Gelir/Gider sayfalarında gizlenir.",
              "On the Kasalar page each cash card shows that account's income (↗), expense (↘) and result; the \"All Cash Accounts\" and \"All List Accounts\" boxes have the same lines. Cash accounts linked to lists (List Cash Accounts) do not appear among the top cards but in the second-row \"All List Accounts\" section. Cash and list boxes with a zero amount are hidden on the Income/Expense pages.",
              "Di rûpela Qase de her karta qaseyê dahat (↗), mesref (↘) û encama wê qaseyê nîşan dide; qutiyên \"Hemû Qase\" û \"Hemû Qaseyên Lîsteyê\" jî heman rêzan hene. Qaseyên bi lîsteyan ve girêdayî (Qaseya Lîsteyê) di kartên jorîn de nayên xuyakirin, di beşa \"Hemû Qaseyên Lîsteyê\" ya rêza duyemîn de ne. Qutiyên qase û lîsteyê yên mîqdara wan sifir e di rûpelên Dahat/Mesref de têne veşartin.",
            )}
          </p>
        </>
      ),
    },
    {
      id: "excelImport",
      title: tx(language, "Excel'den Kasa Aktar", "Import a Cash Account from Excel", "Qaseyekê ji Excelê Têxe"),
      body: (
        <>
          <p>
            {tx(
              language,
              "Kasalar sayfasındaki \"⇧ Excel'den Kasa Aktar\" düğmesi, gelir ve gider sayfaları olan bir Excel dosyasını (Kürtçe başlıklar dahil) seçtiğiniz kasaya aktarır. Dosya tarayıcıda okunur; onaylamadan hiçbir şey kaydedilmez.",
              "The \"⇧ Import Cash from Excel\" button on the Kasalar page imports an Excel file with income and expense sheets (Kurdish headers included) into the cash account you choose. The file is read in the browser; nothing is saved until you confirm.",
              "Bişkoka \"⇧ Qase ji Excelê Têxe\" a di rûpela Qase de pelê Excel yê bi rûpelên dahat û mesrefê (sernavên Kurdî jî) têxe qaseya hilbijartî. Pel di gerokê de tê xwendin; heta hûn erê nekin tu tişt nayê tomarkirin.",
            )}
          </p>
          <ul>
            <li>
              {tx(
                language,
                "1) Dosya ve kasa: .xlsx dosyasını seçin, hedef kasayı seçin ya da yeni kasa adı yazın. İsterseniz kasayı Liste Kasası yapın.",
                "1) File and cash account: choose the .xlsx file, then pick the target cash account or type a new name. You can also make it a List cash account.",
                "1) Pel û qase: pela .xlsx hilbijêrin, qaseya armanc hilbijêrin an navekî nû binivîsin. Her wiha dikarin wê bikin Qaseya Lîsteyê.",
              )}
            </li>
            <li>
              {tx(
                language,
                "2) Sayfalar ve sütunlar: her tablo (yan yana gelir/gider tabloları dahil) Gelir, Gider veya Yok say olarak tahmin edilir; sütunlar Kürtçe başlıklardan eşleşir ve \"Sütunlar\" ile elle değiştirilebilir. Gizli sayfalar varsayılan olarak aktarılmaz. Özet sayfalarındaki sayılar kontrol için gösterilir.",
                "2) Sheets and columns: each table (including side-by-side income/expense tables) is guessed as Income, Expense or Ignore; columns are matched from Kurdish headers and can be changed by hand under \"Columns\". Hidden sheets are not imported by default. Numbers from summary sheets are shown for checking.",
                "2) Rûpel û stûn: her tablo (tabloyên dahat/mesrefê yên li kêleka hev jî) wekî Dahat, Mesref an Paşguh bike tê texmînkirin; stûn ji sernavên Kurdî têne hevber kirin û bi \"Stûn\" bi destî dikarin werin guhertin. Rûpelên veşartî bi gelemperî nayên barkirin. Hejmarên rûpelên kurte ji bo kontrolê têne nîşandan.",
              )}
            </li>
            <li>
              {tx(
                language,
                "3) Önizleme ve aktarım: kayıt sayısı, gelir ve gider toplamı ve ilk kayıtlar görünür. Aynı fatura numaralı satırlar tek kayıtta toplanır (ürün satırları \"Detay\" tablosuna girer); sayfa adı Proje olarak yazılabilir; ay/gün ters okunmuş şüpheli tarihler düzeltilebilir.",
                "3) Preview and import: record count, income and expense totals and the first records are shown. Rows with the same invoice number are combined into one record (item rows go to the \"Detail\" table); the sheet name can be written as Project; suspicious day/month-swapped dates can be fixed.",
                "3) Pêşdîtin û barkirin: hejmara qeydan, hejmara dahat û mesrefê û qeydên yekem têne nîşandan. Rêzên bi heman hejmara fatûreyê di yek qeydê de têne civandin (berhem diçin tabloya \"Hûrgulî\"); navê rûpelê dikare wekî Proje were nivîsandin; dîrokên bi guman ên roj/meh berevajî dikarin werin rastkirin.",
              )}
            </li>
            <li>
              {tx(
                language,
                "Güvenlik: aynı dosya tekrar yüklenirse daha önce aktarılan satırlar atlanır; aktarım bittiğinde \"Geri al\" ile tüm aktarım silinebilir. Suriye lirası (SYP) para birimi desteklenir.",
                "Safety: if the same file is uploaded again, rows already imported are skipped; when the import finishes you can remove the whole import with \"Undo\". The Syrian pound (SYP) currency is supported.",
                "Ewlehî: heke heman pel dîsa were barkirin, rêzên berê hatine barkirin têne bihurandin; piştî barkirinê bi \"Vegerîne\" hemû barkirin dikare were jêbirin. Dirava lîreya Sûriyê (SYP) tê piştgirîkirin.",
              )}
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "expenseDetail",
      title: tx(language, "Gider Detay Tablosu", "Expense Detail Table", "Tabloya Hûrguliyên Mesrefê"),
      body: (
        <p>
          {tx(
            language,
            "Gider kaydında \"Gider Detaylarını Görüntüle\" bölümüne Excel veya Google Sheets'ten kopyaladığınız tabloyu Ctrl+V (ya da \"⎘ Yapıştır\") ile yapıştırabilirsiniz. Hücreleri düzenleyebilir, satır/sütun başlığına sağ tıklayıp ekleyip silebilir, başlık kenarlarından genişlik/yükseklik ayarlayabilir ve hücre hizalamasını (sola/ortaya/sağa, üste/ortaya/alta) araç çubuğundan seçebilirsiniz. Kayıttan sonra satırdaki \"Detay\" düğmesi tabloyu genişletilebilir bir pencerede gösterir; tablo panoya kopyalanabilir veya Excel'e aktarılabilir.",
            "In an expense record you can paste a table copied from Excel or Google Sheets into \"View Expense Details\" with Ctrl+V (or \"⎘ Paste\"). You can edit cells, right-click a row/column header to insert or delete, drag header edges to change width/height, and choose cell alignment (left/center/right, top/middle/bottom) from the toolbar. After saving, the row's \"Detail\" button shows the table in an expandable window; it can be copied to the clipboard or exported to Excel.",
            "Di qeydeke mesrefê de hûn dikarin tabloya ji Excel an Google Sheets hatiye kopîkirin di beşa \"Hûrguliyên Mesrefê Nîşan Bide\" de bi Ctrl+V (an \"⎘ Bi cih bike\") bi cih bikin. Hûn dikarin şaneyan biguherînin, bi tikandina rastê ya li ser sernavê rêz/stûnê zêde bikin û jê bibin, bi kişandina kêleka sernavê firehî/bilindî ayar bikin û rastkirina şaneyê ji darika amûran hilbijêrin. Piştî tomarkirinê bişkoka \"Hûrgulî\" tabloyê di paceyeke fireh dibe de nîşan dide; dikare ji panoyê re were kopîkirin an ji Excelê re were derxistin.",
          )}
        </p>
      ),
    },
    {
      id: "attachments",
      title: tx(language, "Ek Dosyalar", "Attachments", "Peldankên Pêvekirî"),
      body: (
        <p>
          {tx(
            language,
            "Bir kayda Excel, Word, PowerPoint veya PDF dosyası ekleyebilirsiniz (en fazla 5 dosya, dosya başına ~6MB). PDF ve CSV/Excel dosyaları uygulama içinde önizlenebilir; diğer dosya türleri \"İndir\" ile bilgisayarınıza kaydedilir.",
            "You can attach Excel, Word, PowerPoint or PDF files to a record (up to 5 files, ~6MB each). PDF and CSV/Excel files can be previewed inside the app; other file types are saved to your computer via \"Download\".",
            "Hûn dikarin pelên Excel, Word, PowerPoint an PDF li qeydekê zêde bikin (herî zêde 5 pel, ~6MB ji bo her pelî). Pelên PDF û CSV/Excel dikarin di hundirê sepanê de werin pêşdîtin; cureyên din bi \"Daxîne\" li ser kompîturê tên tomarkirin.",
          )}
        </p>
      ),
    },
    {
      id: "notes",
      title: tx(language, "Mali Özel Notlar", "Private Finance Notes", "Nîşeyên Taybet ên Darayî"),
      body: (
        <>
          <p>
            {tx(
              language,
              "Örnek: \"Örnek A.Ş. — Ekim ayı KDV beyannamesi son 3 gün içinde verilmeli\" gibi hatırlatıcı notlar burada tutulur. Bir not birden fazla kullanıcıya atanabilir, durumu (Önemli/Acil/Bekleyen/Tamamlanmış) değiştirilebilir.",
              "Example: reminders like \"Örnek A.Ş. — the October VAT return is due within 3 days\" live here. A note can be assigned to several users at once and moved between statuses (Important/Urgent/Pending/Completed).",
              "Mînak: bîrxistinên wek \"Örnek A.Ş. — beyana KDV'yê ya cotmehê divê di 3 rojan de were dayin\" li vir tên girtin. Nîşeyek dikare bi hevdemî ji çend bikarhêneran re were vekirin û di navbera rewşan (Girîng/Acîl/Li Bendê/Qediyayî) de were guhastin.",
            )}
          </p>
          <p>
            {tx(
              language,
              "Okunmamış notlar sol menüdeki rozetle ve kart üzerindeki mavi noktayla gösterilir. Artık ihtiyacınız kalmayan bir notu silmek yerine \"Arşivle\" ile panodan kaldırabilirsiniz — arşivlenen notlar Arşiv > Notlar Arşivi'nde kalıcı olarak durur.",
              "Unread notes are marked with a badge on the sidebar and a blue dot on the card. Instead of deleting a note you no longer need active, use \"Archive\" to remove it from the board — archived notes stay permanently under Arşiv > Notlar Arşivi.",
              "Nîşeyên nexwendî bi rozeteke li menuya kêlekê û xalek şîn a li ser kartê tên nîşandan. Li şûna jêbirina nîşeyek ku êdî ne pêwîst e, bi \"Arşîv Bike\" wê ji panoyê rake — nîşeyên arşîvkirî bi awayekî daîmî di Arşîv > Arşîva Nîşeyan de dimînin.",
            )}
          </p>
        </>
      ),
    },
    {
      id: "comments",
      title: tx(language, "Yorumlar", "Comments", "Şîrove"),
      body: (
        <p>
          {tx(
            language,
            "Herhangi bir kasa/gelir/gider kaydına, o satırdaki 💬 simgesinden yorum ekleyebilirsiniz — örneğin \"Bu fatura muhasebeciye iletildi mi?\" gibi. \"⚠️ Dikkat\" işaretli yorumlar ayrı bir sekmede toplanır. Artık güncel olmayan bir konuşmayı \"Arşivle\" ile ana listeden kaldırabilirsiniz; Arşiv > Yorumlar Arşivi'nde özet olarak kalır.",
            "Add a comment to any kasa/income/expense record from the 💬 icon on its row — e.g. \"Has this invoice been sent to the accountant?\". Comments flagged \"⚠️ Attention\" are collected in a separate tab. Use \"Archive\" to remove a stale conversation from the main list; it stays as a summary under Arşiv > Yorumlar Arşivi.",
            "Ji sembola 💬 ya li ser rêzê, hûn dikarin şîroveyekê li her qeydek qase/dahat/mesref zêde bikin — mînak \"Ev fatûre gihîşt hesabdêr?\". Şîroveyên bi nîşana \"⚠️ Balkêşî\" di hilfirînek cuda de tên civandin. Bi \"Arşîv Bike\" hûn dikarin sohbetek ne-rojane ji lîsteya sereke rakin; ew wek kurte di Arşîv > Arşîva Şîroveyan de dimîne.",
          )}
        </p>
      ),
    },
    {
      id: "archive",
      title: tx(language, "Arşiv", "Archive", "Arşîv"),
      body: (
        <p>
          {tx(
            language,
            "Arşiv; düzenlenen/silinen kasa kayıtlarını, hazırlanan raporları, arşivlenmiş özel notları ve arşivlenmiş yorum konularını tek bir yerde, yıl/birim/kasa/bölüm filtreleriyle listeler. Hiçbir şey kalıcı olarak kaybolmaz.",
            "Arşiv lists edited/deleted cash records, prepared reports, archived private notes and archived comment threads in one place, filterable by year/unit/kasa/section. Nothing is ever permanently lost.",
            "Arşîv qeydên qase yên hatine guherandin/jêbirin, raporên amadekirî, nîşeyên taybet ên arşîvkirî û mijarên şîroveyê yên arşîvkirî li cîhekî, bi fîltreyên sal/yekîne/qase/beş dide xuyakirin. Tu tişt bi awayekî daîmî winda nabe.",
          )}
        </p>
      ),
    },
    {
      id: "reports",
      title: tx(language, "Rapor Hazırla", "Prepare Report", "Raporê Amade Bike"),
      body: (
        <p>
          {tx(
            language,
            "Belirli bir tarih aralığındaki gelir/gider kayıtlarını seçip \"Örnek A.Ş. — 3. Çeyrek Mali Raporu\" gibi imzalı, sunuma hazır bir rapor oluşturabilirsiniz. Hazırlanan raporlar Arşiv'de saklanır.",
            "Select income/expense records within a date range to build a signed, presentation-ready report like \"Örnek A.Ş. — Q3 Financial Report\". Prepared reports are kept in Arşiv.",
            "Hûn dikarin qeydên dahat/mesref ên di navbereke tarîxê de hilbijêrin û raporeke îmzekirî, amade ji bo pêşkêşkirinê wek \"Örnek A.Ş. — Rapora Darayî ya Sê Mehî\" çêbikin. Raporên amade li Arşîvê tên parastin.",
          )}
        </p>
      ),
    },
    {
      id: "users",
      title: tx(language, "Kullanıcılar ve Yetkiler", "Users & Permissions", "Bikarhêner û Destûr"),
      body: (
        <p>
          {tx(
            language,
            "Bir yönetici, örneğin \"Örnek A.Ş. Muhasebe\" rolündeki bir kullanıcıya sadece Gelir ve Gider sayfalarına erişim izni verebilir; \"Örnek A.Ş. Denetim\" rolündeki bir kullanıcıya ise sadece Arşiv'i salt-okunur açabilir. Her kullanıcı, Kullanıcılar sayfasından kendi adını ve şifresini güncelleyebilir.",
            "An admin can, for example, grant a user with the \"Örnek A.Ş. Accounting\" role access only to Gelir and Gider, while an \"Örnek A.Ş. Audit\" role only sees Arşiv read-only. Every user can update their own name and password from Kullanıcılar.",
            "Rêvebirek dikare, mînak, bikarhênerekî bi rola \"Hesabdariya Örnek A.Ş.\" tenê destûra Dahat û Mesrefê bide; bikarhênerekî bi rola \"Denetleme Örnek A.Ş.\" jî tenê Arşîvê bi tenê-xwendinê vebike. Her bikarhêner dikare navê xwe û şîfreya xwe ji Bikarhêner biguherîne.",
          )}
        </p>
      ),
    },
    {
      id: "settings",
      title: tx(language, "Ayarlar", "Settings", "Mîheng"),
      body: (
        <p>
          {tx(
            language,
            "Ayarlar'dan şirket adını/logosunu, yazı tipi ve renk tercihlerini, engellenen IP listesini ve (süper admin için) Ana Sayfa'da hangi paylaşılan kasaların birleştirileceğini yönetebilirsiniz. Veri (Database) Ayarları'ndan tüm verilerinizi JSON olarak dışa/içe aktarabilirsiniz.",
            "Ayarlar lets you manage the company name/logo, font and color preferences, the blocked-IP list, and (for super admins) which shared kasas get merged into Ana Sayfa. Database Settings lets you export/import all your data as JSON.",
            "Ji Mîhengan hûn dikarin navê/logoya kompaniyê, tercîhên curenivîs û rengî, lîsteya IP'yên astengkirî û (ji bo super-admin) kîjan qaseyên parvekirî di Rûpela Sereke de tên yekbûn bi rêve bibin. Ji Mîhengên Danegehê hûn dikarin hemû daneyên xwe wek JSON derxin/têxin.",
          )}
        </p>
      ),
    },
  ];
  const [topicId, setTopicId] = useState(topics[0].id);
  // Dil değişince seçili konu başlığı aynı kalır ama metni ilgili dile
  // otomatik döner — çünkü topics dizisi her render'da language'a göre
  // yeniden kuruluyor, hardcoded bir kopya tutulmuyor.
  const active = topics.find((t) => t.id === topicId) ?? topics[0];
  return (
    <div className="panel">
      <Title
        title={tx(language, "Kullanım Kılavuzu", "User Guide", "Rêbera Bikaranînê")}
        sub={tx(
          language,
          "Uygulamanın bölümleri ve nasıl kullanılacağı — örnekler kurgusaldır, gerçek veri içermez",
          "The app's sections and how to use them — examples are fictional, no real data is shown",
          "Beşên sepanê û çawa bêne bikaranîn — mînak xeyalî ne, tu daneya rastîn nîşan nadin",
        )}
      />
      <div className="commentSplitView guideSplitView">
        <div className="commentSplitList guideTopicList">
          {topics.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`commentListItem${topicId === t.id ? " active" : ""}`}
              onClick={() => setTopicId(t.id)}
            >
              <span className="commentListItemHead">
                <strong>{t.title}</strong>
              </span>
            </button>
          ))}
        </div>
        <div className="commentSplitDetail guideTopicDetail">
          <article className="commentCard">
            <header>
              <div>
                <strong>{active.title}</strong>
              </div>
            </header>
            <div className="guideBody">{active.body}</div>
          </article>
        </div>
      </div>
    </div>
  );
}
