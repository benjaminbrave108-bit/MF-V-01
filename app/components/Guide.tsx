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
              "Sol menüden Kasalar, Gelir, Gider, Rapor Hazırla, Mali Özel Notlarım, Yorumlar, Arşiv, Kullanıcılar ve Ayarlar bölümlerine ulaşabilirsiniz. Her bölüm, yalnızca yetkiniz olan verileri gösterir.",
              "The left menu gives you access to Kasalar (Cash), Gelir (Income), Gider (Expense), Rapor Hazırla (Prepare Report), Mali Özel Notlarım (Private Notes), Yorumlar (Comments), Arşiv (Archive), Kullanıcılar (Users) and Ayarlar (Settings). Each section only shows data you're permitted to see.",
              "Ji menuya çepê hûn dikarin bigihîjin beşên Qase, Dahat, Mesref, Raporê Amade Bike, Nîşeyên Min ên Taybet, Şîrove, Arşîv, Bikarhêner û Mîheng. Her beş tenê daneyên ku destûra we jê heye nîşan dide.",
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
