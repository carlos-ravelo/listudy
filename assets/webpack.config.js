const path = require('path');
const glob = require('glob');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('css-minimizer-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const stockfish = require('./stockfish.config.js');
if (require('stockfish/package.json').version !== stockfish.version) {
  throw new Error('Stockfish package version must match stockfish.config.js');
}

module.exports = (env, options) => {
  const devMode = options.mode !== 'production';

  return {
    optimization: {
      minimizer: [
        new TerserPlugin({ cache: true, parallel: false, sourceMap: devMode }),
        new OptimizeCSSAssetsPlugin({ parallel: false })
      ]
    },
    entry: {
      'bootstrap_site': ['./js/entries/site.js'],
      'bootstrap_ui': ['./js/entries/ui.js'],
      'bootstrap_study': ['./js/entries/study.js'],
      'bootstrap_management': ['./js/entries/management.js'],
      'bootstrap_editor': ['./js/entries/editor.js'],
      'bootstrap_analysis': ['./js/entries/analysis.js'],
      'bootstrap_tactics': ['./js/entries/tactics.js'],
      'bootstrap_discovery': ['./js/entries/discovery.js'],
      'live_view': glob.sync('./vendor/**/*.js').concat(['./js/entries/live_view.js']),
      'tactics': glob.sync('./vendor/**/*.js').concat(['./js/pages/training/tactics.js']),
      'chessclicker': glob.sync('./vendor/**/*.js').concat(['./js/pages/training/chessclicker.js']),
      'blind_tactics': glob.sync('./vendor/**/*.js').concat(['./js/pages/training/blind_tactics.js']),
      'pieceless_tactics': glob.sync('./vendor/**/*.js').concat(['./js/pages/training/pieceless_tactics.js']),
      'play_stockfish': glob.sync('./vendor/**/*.js').concat(['./js/pages/training/play_stockfish.js']),
      'endgames': glob.sync('./vendor/**/*.js').concat(['./js/pages/training/endgames.js']),
      'remember_lichess_study': glob.sync('./vendor/**/*.js').concat(['./js/pages/study/remember_lichess_study.js']),
      'study': glob.sync('./vendor/**/*.js').concat(['./js/pages/study/study.js']),
      'study_editor': glob.sync('./vendor/**/*.js').concat(['./js/pages/study/study_editor.js']),
      'study_maintenance': glob.sync('./vendor/**/*.js').concat(['./js/pages/study/study_maintenance.js']),
      'train_mistakes': glob.sync('./vendor/**/*.js').concat(['./js/pages/analysis/train_mistakes.js']),
      'analysis_overview': glob.sync('./vendor/**/*.js').concat(['./js/pages/analysis/analysis_overview.js']),
      'analysis_games': glob.sync('./vendor/**/*.js').concat(['./js/pages/analysis/analysis_games.js']),
      'quick_result': glob.sync('./vendor/**/*.js').concat(['./js/pages/analysis/quick_result.js'])


    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, '../priv/static/js'),
      publicPath: '/js/'
    },
    devtool: devMode ? 'source-map' : undefined,
    module: {
      rules: [
        {
          test: /\.js$/,
          include: path.resolve(__dirname, 'node_modules/alpinejs'),
          use: {
            loader: 'babel-loader',
            options: {
              presets: [['@babel/preset-env', { targets: { safari: '13' } }]]
            }
          }
        },
        {
          test: /\.m?js$/,
          include: path.resolve(__dirname, 'node_modules/ts-fsrs'),
          use: {
            loader: 'babel-loader',
            options: {
              presets: [['@babel/preset-env', { targets: { safari: '13' } }]]
            }
          }
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader'
          }
        },
        {
          test: /\.[s]?css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'sass-loader',
          ],
        }
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: '../css/[name].css' }),
      new CopyWebpackPlugin(
          {
              patterns: [
                  { from: 'static/', to: '../' },
                  ...[stockfish.engine + '.js', stockfish.engine + '.wasm', stockfish.fallback + '.js'].map(file => ({
                    from: 'node_modules/stockfish/bin/' + file, to: '../stockfish/' + stockfish.version + '/' + file
                  })),
                  { from: 'node_modules/stockfish/Copying.txt', to: '../stockfish/' + stockfish.version + '/Copying.txt' }
              ]
          }
      )
    ]
  }
};
