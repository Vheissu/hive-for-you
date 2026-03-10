import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { ForYouPage } from './pages/ForYouPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate replace to="/for-you" />,
  },
  {
    path: '/for-you',
    element: <ForYouPage />,
  },
  {
    path: '*',
    element: <Navigate replace to="/for-you" />,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
