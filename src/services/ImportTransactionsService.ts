import csvParse from 'csv-parse';
import fs from 'fs';
import { In, getCustomRepository, getRepository } from 'typeorm';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CsvTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(file: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsStream = fs.createReadStream(file);

    const parsers = csvParse({
      from_line: 2
    });
    const parseCsv = contactsStream.pipe(parsers);

    const transactions: CsvTransaction[] = [];
    const categories: string[] = [];

    parseCsv.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) => cell.trim());

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCsv.on('end', resolve));

    const existingCategories = await categoriesRepository.find({
      where: { title: In(categories) }
    });

    const categoryTitles = existingCategories.map((category: Category) => category.title);

    const addCategories = categories.filter(category => !categoryTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) == index);

    const newCategories = categoriesRepository.create(
      addCategories.map(title => ({ title })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existingCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(category => category.title == transaction.category)
      }))
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(file);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
