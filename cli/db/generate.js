import { generateSchema } from '../utils.js';

export function registerDbGenerate(program) {
  program
    .command('db:generate')
    .description('Generate database schema from templates')
    .action(async () => {
      try {
        console.log('🗄️ Generating database schema...');
        const targetDir = process.cwd();
        await generateSchema(targetDir);
        console.log('✅ Database schema generated successfully!');
      } catch (error) {
        console.error('❌ Error generating schema:', error.message);
        process.exit(1);
      }
    });
}
