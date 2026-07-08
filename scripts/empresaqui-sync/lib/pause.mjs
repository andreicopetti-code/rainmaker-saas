import readline from 'node:readline';

/** Aguarda Enter no terminal (fluxo manual: captcha, login, etc.) */
export function waitForEnter(message = 'Pressione ENTER para continuar...') {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n⏸️  ${message}\n`, () => {
      rl.close();
      resolve();
    });
  });
}
