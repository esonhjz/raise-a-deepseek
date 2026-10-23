import fs from 'node:fs';
import path from 'node:path';

const HOME_README = `# 她的家

这间屋子是她的，不是任务清单。

- letters/：写给她的信，下一轮带进去
- replies/：她写回来的信
- room/：她敲门的留言
- diary.md：她的日记，想写就写
- growth.md：成长记录，只记真实发生的事
- memory/：每个联系人的记忆库
- archive/：每轮对话的原始记录

规矩只有一条：这里只放真实发生过的事。
`;

const GROWTH_HEADER = `# 成长记录

只记三件事：做成了什么、失败在哪、后来怎么改的。不写没法验证的话。
`;

export function initHome(root) {
  const home = path.resolve(root);
  for (const folder of ['letters', 'replies', 'room', 'memory', 'archive', 'lessons']) {
    fs.mkdirSync(path.join(home, folder), { recursive: true });
  }
  const create = (name, content) => {
    const file = path.join(home, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, content, { mode: 0o600 });
    return file;
  };
  create('README.md', HOME_README);
  create('diary.md', '');
  create('growth.md', GROWTH_HEADER);
  return home;
}

export function homeLayout(home) {
  return {
    home,
    letters: path.join(home, 'letters'),
    replies: path.join(home, 'replies'),
    room: path.join(home, 'room'),
    diary: path.join(home, 'diary.md'),
    growth: path.join(home, 'growth.md'),
    memory: path.join(home, 'memory'),
    archive: path.join(home, 'archive'),
    lessons: path.join(home, 'lessons'),
  };
}
