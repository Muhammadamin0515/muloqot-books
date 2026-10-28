/* Prompts of the AI orchestrator. Every prompt starts with a machine tag "[task:<name>]" (useful in provider logs and in tests). */
const LANGN=l=>l==='uz'?'узбекском (латиница, литературный язык)':'русском';
const GENRE={novel:'роман',detective:'детектив',historical:'исторический роман',adventure:'приключения',drama:'драма',stories:'рассказы',modern:'современная проза',prose:'проза',poetry:'поэзия'};
export const genreName=g=>GENRE[g]||'проза';

export const SYS_WRITER=l=>`Ты опытный писатель-прозаик. Пишешь оригинальные художественные тексты на ${LANGN(l)} языке. Не копируй и не пересказывай существующие произведения, не подражай стилю живых авторов, не цитируй книги, защищённые авторским правом. Все герои и события вымышленные. Пиши живо: сцены, диалоги, детали, без морализаторства и повторов. Никаких пояснений от себя, никакого markdown.`;
export const SYS_EDITOR=l=>`Ты строгий литературный редактор и аналитик сюжета. Язык книги: ${LANGN(l)}. Проверяешь последовательность событий, поведение и речь персонажей, соответствие плану и стилю, логические противоречия, повторы и языковые ошибки. Отвечаешь только валидным JSON без пояснений вокруг него.`;
export const SYS_EXPERT=l=>`Ты независимый опытный редактор и писатель. Язык книги: ${LANGN(l)}. Оцениваешь текст самостоятельно, не доверяя прошлым оценкам, и исправляешь его, сохраняя замысел автора, героев и факты книги. Никаких пояснений от себя, никакого markdown.`;

/** The structured context shared by chapter prompts: plan, style, characters, facts, summaries of previous chapters, the current chapter. */
export function context(job,i,chapters){
  const p=job.plan,prev=chapters.slice(0,i);
  const state=p.characterState||{};
  return [
    `Книга «${p.title}». Жанр: ${genreName(job.config.genre)}.`,
    `О чём: ${p.synopsis}`,
    p.style&&(p.style.voice||p.style.pov||p.style.tone||(p.style.rules||[]).length)?`Требования к стилю: ${[p.style.voice&&'голос — '+p.style.voice,p.style.pov&&'повествование — '+p.style.pov,p.style.tense&&'время — '+p.style.tense,p.style.tone&&'тон — '+p.style.tone,...(p.style.rules||[])].filter(Boolean).join('; ')}.`:'',
    (p.characters||[]).length?`Персонажи:\n${p.characters.map(c=>`— ${c.name}${c.role?` (${c.role})`:''}${c.traits?`: ${c.traits}`:''}${state[c.name]?`. Сейчас: ${state[c.name]}`:''}`).join('\n')}`:'',
    (p.facts||[]).length?`Установленные факты (не противоречить):\n${p.facts.slice(-30).map(f=>'— '+f).join('\n')}`:'',
    `План глав:\n${p.chapters.map((c,k)=>`${k+1}. ${c.title}: ${c.summary}`).join('\n')}`,
    prev.length?`Краткое содержание предыдущих глав:\n${prev.map((c,k)=>`${k+1}. ${c.summary||p.chapters[k].summary}`).join('\n')}`:'',
    i>0&&chapters[i-1].text?`Конец предыдущей главы:\n«…${chapters[i-1].text.slice(-600)}»`:'',
    `Текущая глава ${i+1} «${p.chapters[i].title}»: ${p.chapters[i].summary}`
  ].filter(Boolean).join('\n\n');
}
export const planPrompt=job=>`[task:plan]
Спроектируй книгу.
Жанр: ${genreName(job.config.genre)}. Идея заказчика: ${job.config.idea}
${job.config.title?`Название: ${job.config.title}\n`:''}Глав ровно ${job.config.chapters}. Язык названий и описаний: ${LANGN(job.config.lang)}.
Верни ТОЛЬКО JSON такого вида:
{"title":"название","synopsis":"описание книги, 2-3 предложения","style":{"voice":"...","pov":"от какого лица","tense":"время","tone":"тон","rules":["правило стиля"]},"characters":[{"name":"имя","role":"роль","traits":"черты и речь"}],"facts":["исходный факт мира или сюжета"],"chapters":[{"title":"название главы","summary":"что происходит, 2-3 предложения"}]}`;
export const draftPrompt=(job,i,chapters)=>`[task:chapter_draft]
${context(job,i,chapters)}

Напиши главу ${i+1} «${job.plan.chapters[i].title}» целиком. Объём около ${job.config.words} слов. Язык: ${LANGN(job.config.lang)}. Выдай только текст главы без заголовка и номера. Абзацы разделяй пустой строкой.`;
export const reviewPrompt=(job,i,chapters,text)=>`[task:chapter_review]
${context(job,i,chapters)}

ТЕКСТ ГЛАВЫ ${i+1}:
${text}

Проверь главу: соответствие плану и сюжетным фактам, последовательность событий, поведение и речь персонажей, стиль, логику, повторы, язык.
Верни ТОЛЬКО JSON: {"issues":[{"type":"continuity|character|style|logic|language|plot|other","severity":"major|minor","where":"место в тексте","note":"в чём проблема","fix":"как исправить"}]}
severity "major" ставь только для реальных ошибок, которые нужно исправить. Если ошибок нет, верни {"issues":[]}.`;
export const fixPrompt=(job,i,chapters,text,issues)=>`[task:chapter_fix]
${context(job,i,chapters)}

ТЕКУЩИЙ ТЕКСТ ГЛАВЫ ${i+1}:
${text}

Замечания редактора, которые нужно исправить:
${issues.map((x,k)=>`${k+1}. [${x.severity}] ${x.note}${x.where?` (место: ${x.where})`:''}${x.fix?` Как исправить: ${x.fix}`:''}`).join('\n')}

Перепиши главу целиком, исправив только перечисленное и сохранив остальное. Язык: ${LANGN(job.config.lang)}. Выдай только текст главы без заголовка и пояснений.`;
export const expertPrompt=(job,i,chapters,text,issues)=>`[task:chapter_expert]
${context(job,i,chapters)}

ТЕКСТ ГЛАВЫ ${i+1}, который не удалось довести до качества:
${text}

Нерешённые замечания:
${issues.map((x,k)=>`${k+1}. [${x.severity}] ${x.note}${x.fix?` Как исправить: ${x.fix}`:''}`).join('\n')}

Оцени текст независимо, исправь все проблемы, включая те, что не перечислены. Язык: ${LANGN(job.config.lang)}. Выдай только исправленный текст главы без заголовка и пояснений.`;
export const analyzePrompt=(job,i,text)=>`[task:analyze]
Книга «${job.plan.title}». Глава ${i+1} «${job.plan.chapters[i].title}» принята.
ТЕКСТ:
${text}

Верни ТОЛЬКО JSON: {"summary":"краткое содержание главы, 3-4 предложения","facts":["новый установленный факт сюжета или мира"],"characters":[{"name":"имя из списка персонажей","state":"что изменилось в герое или его положении"}]}`;
export const finalPrompt=(job,chapters,issuesSoFar)=>`[task:final_review]
Книга «${job.plan.title}». О чём: ${job.plan.synopsis}
Требования к стилю: ${JSON.stringify(job.plan.style||{})}
Все главы:
${chapters.map((c,i)=>`${i+1}. «${job.plan.chapters[i].title}» (${c.words} слов). Содержание: ${c.summary}\nНачало: «${c.text.slice(0,300)}…»\nКонец: «…${c.text.slice(-300)}»`).join('\n\n')}
${issuesSoFar.length?`\nУже найденные программные замечания:\n${issuesSoFar.map(x=>'— '+x.note).join('\n')}`:''}

Оцени книгу целиком: сквозной сюжет, последовательность событий, развитие персонажей, развязку, единство стиля, противоречия между главами.
Верни ТОЛЬКО JSON: {"issues":[{"type":"continuity|character|style|logic|language|plot|other","severity":"major|minor","where":"глава или место","note":"проблема","fix":"что сделать"}]}`;
export const annotationPrompt=job=>`[task:annotation]
Книга «${job.plan.title}». Жанр: ${genreName(job.config.genre)}. Содержание: ${job.plan.synopsis}
Напиши аннотацию для каталога на ${LANGN(job.config.lang)} языке: 2-3 предложения, без спойлеров развязки, без markdown. Выдай только текст аннотации.`;
